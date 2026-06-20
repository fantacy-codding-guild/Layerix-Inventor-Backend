import prisma from '../lib/prisma';
import { z } from 'zod';

// ─── Helpers ─────────────────────────────────────────────
const extractBrandFromNotes = (notes?: string): string | null => {
    if (!notes) return null;
    const match = notes.match(/Brand:\s*(.+)/);
    return match ? match[1].trim() : null;
};

// ─── Validation schemas ──────────────────────────────────
const orderSchema = z.object({
    productId: z.number().int(),
    quantity: z.number().int().positive(),
    unitPrice: z.number().positive(),
    fromVendorId: z.number().int().positive(),
    notes: z.string().optional(),
});

const consumeSchema = z.object({
    productId: z.number().int(),
    quantity: z.number().int().positive(),
    notes: z.string().optional(),
});

const transferOutSchema = z.object({
    productId: z.number().int(),
    quantity: z.number().int().positive(),
    notes: z.string().optional(),
});

// ─── Order material for a project (stock‑in with projectId) ──
export const orderMaterial = async (req: any, res: any) => {
    try {
        const tenantId = req.user.tenantId;
        const projectId = parseInt(req.params.id);

        const validation = orderSchema.safeParse(req.body);
        if (!validation.success) {
            return res.status(400).json({
                message: 'Validation error',
                errors: validation.error.issues.map(i => ({ field: i.path.join('.'), message: i.message })),
            });
        }

        const { productId, quantity, unitPrice, fromVendorId, notes } = validation.data;

        // Verify project, product and vendor
        const project = await prisma.project.findFirst({ where: { id: projectId, tenantId } });
        if (!project) return res.status(404).json({ message: 'Project not found' });

        const product = await prisma.product.findFirst({ where: { id: productId, tenantId } });
        if (!product) return res.status(400).json({ message: 'Product not found' });

        const vendor = await prisma.vendor.findFirst({ where: { id: fromVendorId, tenantId } });
        if (!vendor) return res.status(400).json({ message: 'Vendor not found' });

        // Extract brand from notes (or use 'Unknown')
        const brandName = extractBrandFromNotes(notes) || 'Unknown';
        const unit = product.unit;   // use the product's default unit

        // Stock transaction – update or create the matching InventoryItem
        await prisma.$transaction(async (tx) => {
            const existingItem = await tx.inventoryItem.findFirst({
                where: {
                    tenantId,
                    productId,
                    brand: brandName,
                    unit,
                    vendorId: fromVendorId || null,
                },
            });

            if (existingItem) {
                // Latest price rule: set averageCost to the new unit price (no averaging)
                await tx.inventoryItem.update({
                    where: { id: existingItem.id },
                    data: {
                        quantityOnHand: existingItem.quantityOnHand + quantity,
                        averageCost: unitPrice ?? existingItem.averageCost,
                    },
                });
            } else {
                await tx.inventoryItem.create({
                    data: {
                        tenantId,
                        productId,
                        brand: brandName,
                        unit,
                        vendorId: fromVendorId || null,
                        quantityOnHand: quantity,
                        averageCost: unitPrice || null,
                    },
                });
            }

            // Record the stock movement (linked to the project)
            await tx.stockMovement.create({
                data: {
                    tenantId,
                    productId,
                    type: 'STOCK_IN',
                    quantity,
                    unitPrice,
                    fromVendorId,
                    toProjectId: projectId,      // <-- link to the project
                    referenceType: 'MANUAL_ADJUSTMENT',
                    date: new Date(),
                    notes,
                    createdBy: req.user.userId,
                },
            });
        });

        // Activity log
        await prisma.activityLog.create({
            data: {
                tenantId,
                userId: req.user.userId,
                action: 'ORDER',
                entityType: 'Project',
                entityId: projectId,
                details: { productId, quantity, unitPrice, fromVendorId },
            },
        });

        res.status(201).json({ message: 'Material ordered successfully' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Failed to create order' });
    }
};

// ─── Consume material (stock‑out from project) ──────────────
export const consumeMaterial = async (req: any, res: any) => {
    try {
        const tenantId = req.user.tenantId;
        const projectId = parseInt(req.params.id);

        const validation = consumeSchema.safeParse(req.body);
        if (!validation.success) {
            return res.status(400).json({
                message: 'Validation error',
                errors: validation.error.issues.map(i => ({ field: i.path.join('.'), message: i.message })),
            });
        }

        const { productId, quantity, notes } = validation.data;

        const project = await prisma.project.findFirst({ where: { id: projectId, tenantId } });
        if (!project) return res.status(404).json({ message: 'Project not found' });

        // We need to know which inventory item to consume – the frontend must provide brand/unit/vendor.
        // For simplicity, we'll accept them from the request body (you may need to update the schema).
        const { brand, unit, vendorId } = req.body as any;
        if (!brand || !unit) {
            return res.status(400).json({ message: 'Brand and unit are required to identify the stock line' });
        }

        const inventoryItem = await prisma.inventoryItem.findFirst({
            where: {
                tenantId,
                productId,
                brand,
                unit,
                vendorId: vendorId || null,
            },
        });

        if (!inventoryItem) return res.status(404).json({ message: 'Inventory item not found' });

        const available = inventoryItem.quantityOnHand - inventoryItem.reservedQuantity;
        if (available < quantity) {
            return res.status(400).json({ message: 'Insufficient available stock' });
        }

        // Transaction: decrement the inventory item and record the movement
        await prisma.$transaction(async (tx) => {
            await tx.inventoryItem.update({
                where: { id: inventoryItem.id },
                data: { quantityOnHand: { decrement: quantity } },
            });

            await tx.stockMovement.create({
                data: {
                    tenantId,
                    productId,
                    type: 'STOCK_OUT',
                    quantity,
                    toProjectId: projectId,
                    referenceType: 'PROJECT',
                    date: new Date(),
                    notes,
                    createdBy: req.user.userId,
                },
            });
        });

        await prisma.activityLog.create({
            data: {
                tenantId,
                userId: req.user.userId,
                action: 'CONSUME',
                entityType: 'Project',
                entityId: projectId,
                details: { productId, quantity },
            },
        });

        res.status(201).json({ message: 'Consumption recorded' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Failed to record consumption' });
    }
};

// ─── Transfer material back to office ───────────────────────
export const transferOutMaterial = async (req: any, res: any) => {
    try {
        const tenantId = req.user.tenantId;
        const projectId = parseInt(req.params.id);

        const validation = transferOutSchema.safeParse(req.body);
        if (!validation.success) {
            return res.status(400).json({
                message: 'Validation error',
                errors: validation.error.issues.map(i => ({ field: i.path.join('.'), message: i.message })),
            });
        }

        const { productId, quantity, notes } = validation.data;

        const project = await prisma.project.findFirst({ where: { id: projectId, tenantId } });
        if (!project) return res.status(404).json({ message: 'Project not found' });

        // Similar to consume, we need brand/unit/vendor to know which item to transfer
        const { brand, unit, vendorId } = req.body as any;
        if (!brand || !unit) {
            return res.status(400).json({ message: 'Brand and unit are required to identify the stock line' });
        }

        const inventoryItem = await prisma.inventoryItem.findFirst({
            where: {
                tenantId,
                productId,
                brand,
                unit,
                vendorId: vendorId || null,
            },
        });

        if (!inventoryItem) return res.status(404).json({ message: 'Inventory item not found' });

        const available = inventoryItem.quantityOnHand - inventoryItem.reservedQuantity;
        if (available < quantity) {
            return res.status(400).json({ message: 'Insufficient available stock' });
        }

        // Transaction: decrement the item and record a stock-out (to office = no toProjectId)
        await prisma.$transaction(async (tx) => {
            await tx.inventoryItem.update({
                where: { id: inventoryItem.id },
                data: { quantityOnHand: { decrement: quantity } },
            });

            await tx.stockMovement.create({
                data: {
                    tenantId,
                    productId,
                    type: 'STOCK_OUT',
                    quantity,
                    toProjectId: null,   // office
                    referenceType: 'MANUAL_ADJUSTMENT',
                    date: new Date(),
                    notes: notes || 'Return to office',
                    createdBy: req.user.userId,
                },
            });
        });

        res.status(201).json({ message: 'Return to office recorded' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Failed to transfer out' });
    }
};

// ─── Get project material movements (from StockMovement) ────
export const getProjectMovements = async (req: any, res: any) => {
    try {
        const tenantId = req.user.tenantId;
        const projectId = parseInt(req.params.id);

        const movements = await prisma.stockMovement.findMany({
            where: {
                tenantId,
                OR: [
                    { toProjectId: projectId },
                    { fromVendorId: null, toProjectId: projectId },
                ],
            },
            include: {
                product: { select: { id: true, name: true, unit: true } },
                fromVendor: { select: { id: true, name: true } },
                user: { select: { id: true, name: true } },
            },
            orderBy: { date: 'desc' },
            take: 50,
        });

        const result = movements.map(m => ({
            id: m.id,
            type: m.type === 'STOCK_IN' ? 'ORDER' : m.type === 'STOCK_OUT' ? 'CONSUME' : m.type,
            quantity: m.quantity,
            unitPrice: m.unitPrice,
            date: m.date,
            notes: m.notes,
            product: m.product,
            fromVendor: m.fromVendor,
            user: m.user,
        }));

        res.json(result);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Failed to fetch movements' });
    }
};