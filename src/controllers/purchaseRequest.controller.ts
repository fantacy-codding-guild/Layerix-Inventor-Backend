import prisma from '../lib/prisma';
import { z } from 'zod';
import { purchaseRequestSchema, purchaseRequestItemSchema } from '../validators/procurement.validator';

// GET /api/purchase-requests
export const getPurchaseRequests = async (req: any, res: any) => {
    try {
        const tenantId = req.user.tenantId;
        const { status, page = 1, limit = 20 } = req.query;
        const where: any = { tenantId };
        if (status) where.status = status.toUpperCase();

        const [prs, total] = await Promise.all([
            prisma.purchaseRequest.findMany({
                where,
                include: {
                    items: { include: { product: { select: { id: true, name: true, productCode: true } } } },
                    requester: { select: { id: true, name: true } },
                },
                orderBy: { createdAt: 'desc' },
                skip: (Number(page) - 1) * Number(limit),
                take: Number(limit),
            }),
            prisma.purchaseRequest.count({ where }),
        ]);

        res.json({
            data: prs,
            pagination: {
                page: Number(page),
                limit: Number(limit),
                total,
                totalPages: Math.ceil(total / Number(limit)),
            },
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Failed to fetch purchase requests' });
    }
};

// GET /api/purchase-requests/:id
export const getPurchaseRequest = async (req: any, res: any) => {
    try {
        const pr = await prisma.purchaseRequest.findFirst({
            where: { id: parseInt(req.params.id), tenantId: req.user.tenantId },
            include: {
                items: { include: { product: { select: { id: true, name: true, productCode: true } } } },
                requester: { select: { id: true, name: true } },
            },
        });
        if (!pr) return res.status(404).json({ message: 'Purchase request not found' });
        res.json(pr);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Failed to fetch purchase request' });
    }
};

// POST /api/purchase-requests
export const createPurchaseRequest = async (req: any, res: any) => {
    try {
        const tenantId = req.user.tenantId;
        const validation = purchaseRequestSchema.safeParse(req.body);
        if (!validation.success) {
            return res.status(400).json({ message: 'Validation error', errors: validation.error.issues });
        }

        const { items, ...prData } = validation.data;

        // Verify all products belong to tenant
        const productIds = items.map(i => i.productId);
        const products = await prisma.product.findMany({
            where: { id: { in: productIds }, tenantId },
        });
        if (products.length !== productIds.length) {
            return res.status(400).json({ message: 'One or more products not found' });
        }

        // Generate request number (PR-YYYYMMDD-NNN)
        const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
        const count = await prisma.purchaseRequest.count({ where: { tenantId } });
        const requestNumber = `PR-${today}-${String(count + 1).padStart(3, '0')}`;

        const pr = await prisma.purchaseRequest.create({
            data: {
                tenantId,
                requestNumber,
                requestedBy: req.user.userId,
                dateRequired: prData.dateRequired ? new Date(prData.dateRequired) : undefined,
                notes: prData.notes,
                items: {
                    create: items.map(item => ({
                        productId: item.productId,
                        quantity: item.quantity,
                        estimatedPrice: item.estimatedPrice,
                    })),
                },
            },
            include: {
                items: { include: { product: { select: { id: true, name: true, productCode: true } } } },
            },
        });

        res.status(201).json(pr);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Failed to create purchase request' });
    }
};

// PUT /api/purchase-requests/:id (status only for simplicity)
export const updatePurchaseRequest = async (req: any, res: any) => {
    try {
        const tenantId = req.user.tenantId;
        const id = parseInt(req.params.id);
        const pr = await prisma.purchaseRequest.findFirst({ where: { id, tenantId } });
        if (!pr) return res.status(404).json({ message: 'Not found' });

        const validation = z.object({
            status: z.enum(['DRAFT', 'APPROVED', 'ORDERED', 'CANCELLED']).optional(),
            notes: z.string().max(1000).optional(),
        }).safeParse(req.body);
        if (!validation.success) {
            return res.status(400).json({ message: 'Validation error', errors: validation.error.issues });
        }

        const updated = await prisma.purchaseRequest.update({
            where: { id },
            data: validation.data,
        });
        res.json(updated);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Failed to update purchase request' });
    }
};

// DELETE /api/purchase-requests/:id
export const deletePurchaseRequest = async (req: any, res: any) => {
    try {
        const tenantId = req.user.tenantId;
        const id = parseInt(req.params.id);
        const pr = await prisma.purchaseRequest.findFirst({ where: { id, tenantId } });
        if (!pr) return res.status(404).json({ message: 'Not found' });

        await prisma.purchaseRequest.delete({ where: { id } });
        res.json({ message: 'Deleted' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Failed to delete' });
    }
};