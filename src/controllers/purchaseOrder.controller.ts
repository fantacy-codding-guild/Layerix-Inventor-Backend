import prisma from '../lib/prisma';
import { z } from 'zod';
import { purchaseOrderSchema } from '../validators/procurement.validator';

// GET /api/purchase-orders
export const getPurchaseOrders = async (req: any, res: any) => {
    try {
        const tenantId = req.user.tenantId;
        const { vendorId, status, page = 1, limit = 20 } = req.query;
        const where: any = { tenantId };
        if (vendorId) where.vendorId = Number(vendorId);
        if (status) {
            const statuses = String(status).split(',').map(s => s.trim().toUpperCase());
            where.status = { in: statuses };
        }

        const [pos, total] = await Promise.all([
            prisma.purchaseOrder.findMany({
                where,
                include: {
                    vendor: { select: { id: true, name: true } },
                    items: { include: { product: { select: { id: true, name: true, productCode: true } } } },
                },
                orderBy: { createdAt: 'desc' },
                skip: (Number(page) - 1) * Number(limit),
                take: Number(limit),
            }),
            prisma.purchaseOrder.count({ where }),
        ]);

        res.json({ data: pos, pagination: { page: Number(page), limit: Number(limit), total, totalPages: Math.ceil(total / Number(limit)) } });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Failed to fetch purchase orders' });
    }
};

// GET /api/purchase-orders/:id
export const getPurchaseOrder = async (req: any, res: any) => {
    try {
        const po = await prisma.purchaseOrder.findFirst({
            where: { id: parseInt(req.params.id), tenantId: req.user.tenantId },
            include: {
                vendor: true,
                items: { include: { product: { select: { id: true, name: true, productCode: true } } } },
            },
        });
        if (!po) return res.status(404).json({ message: 'Not found' });
        res.json(po);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Failed to fetch purchase order' });
    }
};

// POST /api/purchase-orders
export const createPurchaseOrder = async (req: any, res: any) => {
    try {
        const tenantId = req.user.tenantId;
        const validation = purchaseOrderSchema.safeParse(req.body);
        if (!validation.success) {
            return res.status(400).json({ message: 'Validation error', errors: validation.error.issues });
        }
        const { items, ...poData } = validation.data;

        // Verify vendor and project belong to tenant
        const vendor = await prisma.vendor.findFirst({ where: { id: poData.vendorId, tenantId } });
        if (!vendor) return res.status(400).json({ message: 'Vendor not found' });

        if (poData.projectId) {
            const project = await prisma.project.findFirst({ where: { id: poData.projectId, tenantId } });
            if (!project) return res.status(400).json({ message: 'Project not found' });
        }

        const productIds = items.map(i => i.productId);
        const products = await prisma.product.findMany({ where: { id: { in: productIds }, tenantId } });
        if (products.length !== productIds.length) {
            return res.status(400).json({ message: 'One or more products not found' });
        }

        // Generate order number
        const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
        const count = await prisma.purchaseOrder.count({ where: { tenantId } });
        const orderNumber = `PO-${today}-${String(count + 1).padStart(3, '0')}`;

        const totalAmount = items.reduce((sum, i) => sum + (i.unitPrice || 0) * i.quantity, 0);

        const po = await prisma.purchaseOrder.create({
            data: {
                tenantId,
                orderNumber,
                vendorId: poData.vendorId,
                expectedDeliveryDate: poData.expectedDeliveryDate ? new Date(poData.expectedDeliveryDate) : undefined,
                notes: poData.notes,
                totalAmount,
                createdBy: req.user.userId,
                items: {
                    create: items.map(item => ({
                        productId: item.productId,
                        quantity: item.quantity,
                        unitPrice: item.unitPrice,
                        totalPrice: item.unitPrice * item.quantity,
                    })),
                },
            },
            include: {
                vendor: true,
                items: { include: { product: { select: { id: true, name: true, productCode: true } } } },
            },
        });

        // If a purchase request is linked (optional), we can update its status later

        res.status(201).json(po);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Failed to create purchase order' });
    }
};

// PUT /api/purchase-orders/:id (update status)
export const updatePurchaseOrder = async (req: any, res: any) => {
    try {
        const tenantId = req.user.tenantId;
        const id = parseInt(req.params.id);
        const po = await prisma.purchaseOrder.findFirst({ where: { id, tenantId } });
        if (!po) return res.status(404).json({ message: 'Not found' });

        const validation = z.object({
            status: z.enum(['DRAFT', 'SENT', 'PARTIALLY_RECEIVED', 'COMPLETED', 'CANCELLED']).optional(),
            expectedDeliveryDate: z.string().datetime().optional(),
            notes: z.string().optional(),
        }).safeParse(req.body);
        if (!validation.success) return res.status(400).json({ message: 'Validation error', errors: validation.error.issues });

        const updated = await prisma.purchaseOrder.update({ where: { id }, data: validation.data });
        res.json(updated);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Failed to update purchase order' });
    }
};

// DELETE /api/purchase-orders/:id
export const deletePurchaseOrder = async (req: any, res: any) => {
    try {
        const tenantId = req.user.tenantId;
        const id = parseInt(req.params.id);
        const po = await prisma.purchaseOrder.findFirst({ where: { id, tenantId } });
        if (!po) return res.status(404).json({ message: 'Not found' });
        await prisma.purchaseOrder.delete({ where: { id } });
        res.json({ message: 'Deleted' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Failed to delete' });
    }
};