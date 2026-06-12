import prisma from '../lib/prisma';
import { z } from 'zod';

const transferItemSchema = z.object({
    productId: z.number().int().positive(),
    quantity: z.number().int().positive(),
});

const createTransferSchema = z.object({
    fromProjectId: z.number().int().positive().optional(), // null = office
    toProjectId: z.number().int().positive().optional(),   // null = office
    items: z.array(transferItemSchema).min(1),
    notes: z.string().optional(),
});

// Helper: generate transfer number
async function generateTransferNumber(tenantId: number) {
    const count = await prisma.stockTransfer.count({ where: { tenantId } });
    return `TRF-${String(count + 1).padStart(5, '0')}`;
}

// 1. Create transfer request
export const createTransfer = async (req: any, res: any) => {
    try {
        const tenantId = req.user.tenantId;
        const validation = createTransferSchema.safeParse(req.body);
        if (!validation.success) return res.status(400).json({ message: 'Validation error', errors: validation.error.issues });

        const { fromProjectId, toProjectId, items, notes } = validation.data;

        // At least one side must be specified
        if (!fromProjectId && !toProjectId) return res.status(400).json({ message: 'Specify source or destination' });
        if (fromProjectId === toProjectId) return res.status(400).json({ message: 'Source and destination cannot be the same' });

        // Validate projects belong to tenant
        if (fromProjectId) {
            const project = await prisma.project.findFirst({ where: { id: fromProjectId, tenantId } });
            if (!project) return res.status(404).json({ message: 'Source project not found' });
        }
        if (toProjectId) {
            const project = await prisma.project.findFirst({ where: { id: toProjectId, tenantId } });
            if (!project) return res.status(404).json({ message: 'Destination project not found' });
        }

        // Validate stock availability (if from office, check office stock; if from project, check project stock)
        for (const item of items) {
            if (!fromProjectId) {
                // from office
                const stock = await prisma.stock.findUnique({ where: { productId: item.productId } });
                const available = (stock?.quantityOnHand ?? 0) - (stock?.reservedQuantity ?? 0);
                if (available < item.quantity) {
                    return res.status(400).json({ message: `Insufficient office stock for product ID ${item.productId}` });
                }
            } else {
                // from project
                const projectStock = await prisma.projectStock.findUnique({
                    where: { projectId_productId: { projectId: fromProjectId, productId: item.productId } }
                });
                const available = (projectStock?.quantityOnSite ?? 0) - (projectStock?.reservedQuantity ?? 0);
                if (available < item.quantity) {
                    return res.status(400).json({ message: `Insufficient project stock for product ID ${item.productId}` });
                }
            }
        }

        const transferNumber = await generateTransferNumber(tenantId);

        const transfer = await prisma.stockTransfer.create({
            data: {
                tenantId,
                transferNumber,
                fromProjectId: fromProjectId || null,
                toProjectId: toProjectId || null,
                status: 'PENDING',
                items: {
                    create: items.map(item => ({
                        productId: item.productId,
                        quantity: item.quantity,
                    }))
                }
            },
            include: { items: { include: { product: true } } }
        });

        // Log activity
        await prisma.activityLog.create({
            data: {
                tenantId,
                userId: req.user.userId,
                action: 'CREATE',
                entityType: 'StockTransfer',
                entityId: transfer.id,
                details: { transferNumber, fromProjectId, toProjectId }
            }
        });

        res.status(201).json(transfer);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Failed to create transfer' });
    }
};

// 2. List transfers with filters
export const getTransfers = async (req: any, res: any) => {
    try {
        const tenantId = req.user.tenantId;
        const { status, fromProjectId, toProjectId, page = 1, limit = 20 } = req.query;
        const skip = (Number(page) - 1) * Number(limit);

        const where: any = { tenantId };
        if (status) where.status = status;
        if (fromProjectId) where.fromProjectId = Number(fromProjectId);
        if (toProjectId) where.toProjectId = Number(toProjectId);

        const [transfers, total] = await Promise.all([
            prisma.stockTransfer.findMany({
                where,
                include: {
                    fromProject: { select: { id: true, name: true } },
                    toProject: { select: { id: true, name: true } },
                    items: { include: { product: { select: { id: true, name: true, productCode: true, unit: true } } } },
                    approver: { select: { name: true } },
                    dispatcher: { select: { name: true } },
                    receiver: { select: { name: true } },
                },
                orderBy: { createdAt: 'desc' },
                skip,
                take: Number(limit),
            }),
            prisma.stockTransfer.count({ where }),
        ]);

        res.json({ data: transfers, pagination: { page: Number(page), limit: Number(limit), total, totalPages: Math.ceil(total / Number(limit)) } });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Failed to fetch transfers' });
    }
};

// 3. Approve transfer (status -> APPROVED)
export const approveTransfer = async (req: any, res: any) => {
    try {
        const tenantId = req.user.tenantId;
        const id = parseInt(req.params.id);
        const transfer = await prisma.stockTransfer.findFirst({ where: { id, tenantId } });
        if (!transfer) return res.status(404).json({ message: 'Transfer not found' });
        if (transfer.status !== 'PENDING') return res.status(400).json({ message: 'Transfer already processed' });

        const updated = await prisma.stockTransfer.update({
            where: { id },
            data: { status: 'APPROVED', approvedBy: req.user.userId },
        });

        await prisma.activityLog.create({
            data: { tenantId, userId: req.user.userId, action: 'APPROVE', entityType: 'StockTransfer', entityId: id }
        });

        res.json(updated);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Failed to approve transfer' });
    }
};

// 4. Dispatch transfer (status -> DISPATCHED)
export const dispatchTransfer = async (req: any, res: any) => {
    try {
        const tenantId = req.user.tenantId;
        const id = parseInt(req.params.id);
        const transfer = await prisma.stockTransfer.findFirst({
            where: { id, tenantId },
            include: { items: true }
        });
        if (!transfer) return res.status(404).json({ message: 'Transfer not found' });
        if (transfer.status !== 'APPROVED') return res.status(400).json({ message: 'Transfer must be approved first' });

        // Decrease stock from source location (office or project)
        await prisma.$transaction(async (tx) => {
            for (const item of transfer.items) {
                if (!transfer.fromProjectId) {
                    // from office
                    await tx.stock.update({
                        where: { productId: item.productId },
                        data: { quantityOnHand: { decrement: item.quantity } }
                    });
                    await tx.stockMovement.create({
                        data: {
                            tenantId,
                            productId: item.productId,
                            type: 'STOCK_OUT',
                            quantity: item.quantity,
                            toProjectId: transfer.toProjectId,
                            referenceType: 'PROJECT',
                            referenceId: transfer.id,
                            notes: `Transfer ${transfer.transferNumber}`,
                            createdBy: req.user.userId,
                        }
                    });
                } else {
                    // from project
                    await tx.projectStock.update({
                        where: { projectId_productId: { projectId: transfer.fromProjectId!, productId: item.productId } },
                        data: { quantityOnSite: { decrement: item.quantity } }
                    });
                    await tx.projectStockMovement.create({
                        data: {
                            tenantId,
                            projectId: transfer.fromProjectId!,
                            productId: item.productId,
                            type: 'STOCK_OUT',
                            quantity: item.quantity,
                            notes: `Transfer out: ${transfer.transferNumber}`,
                            createdBy: req.user.userId,
                        }
                    });
                }
            }
            await tx.stockTransfer.update({
                where: { id },
                data: { status: 'DISPATCHED', dispatchedBy: req.user.userId }
            });
        });

        res.json({ message: 'Transfer dispatched, stock deducted from source' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Failed to dispatch transfer' });
    }
};

// 5. Receive transfer (status -> RECEIVED, adds stock to destination)
export const receiveTransfer = async (req: any, res: any) => {
    try {
        const tenantId = req.user.tenantId;
        const id = parseInt(req.params.id);
        const transfer = await prisma.stockTransfer.findFirst({
            where: { id, tenantId },
            include: { items: true }
        });
        if (!transfer) return res.status(404).json({ message: 'Transfer not found' });
        if (transfer.status !== 'DISPATCHED') return res.status(400).json({ message: 'Transfer must be dispatched first' });

        await prisma.$transaction(async (tx) => {
            for (const item of transfer.items) {
                if (!transfer.toProjectId) {
                    // to office
                    await tx.stock.upsert({
                        where: { productId: item.productId },
                        update: { quantityOnHand: { increment: item.quantity } },
                        create: { productId: item.productId, quantityOnHand: item.quantity, reservedQuantity: 0 }
                    });
                    await tx.stockMovement.create({
                        data: {
                            tenantId,
                            productId: item.productId,
                            type: 'STOCK_IN',
                            quantity: item.quantity,
                            fromVendorId: null,
                            referenceType: 'PROJECT',
                            referenceId: transfer.id,
                            notes: `Transfer received ${transfer.transferNumber}`,
                            createdBy: req.user.userId,
                        }
                    });
                } else {
                    // to project
                    await tx.projectStock.upsert({
                        where: { projectId_productId: { projectId: transfer.toProjectId!, productId: item.productId } },
                        update: { quantityOnSite: { increment: item.quantity } },
                        create: { projectId: transfer.toProjectId!, productId: item.productId, quantityOnSite: item.quantity, reservedQuantity: 0 }
                    });
                    await tx.projectStockMovement.create({
                        data: {
                            tenantId,
                            projectId: transfer.toProjectId!,
                            productId: item.productId,
                            type: 'STOCK_IN',
                            quantity: item.quantity,
                            notes: `Transfer in: ${transfer.transferNumber}`,
                            createdBy: req.user.userId,
                        }
                    });
                }
            }
            await tx.stockTransfer.update({
                where: { id },
                data: { status: 'RECEIVED', receivedBy: req.user.userId }
            });
        });

        res.json({ message: 'Transfer received, stock added to destination' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Failed to receive transfer' });
    }
};