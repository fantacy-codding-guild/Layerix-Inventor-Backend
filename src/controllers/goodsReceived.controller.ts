import prisma from '../lib/prisma';
import { z } from 'zod';

const goodsReceivedItemSchema = z.object({
    productId: z.number().int().positive(),
    quantityReceived: z.number().int().positive(),
    purchaseOrderItemId: z.number().int().positive().optional(),
});

const goodsReceivedSchema = z.object({
    purchaseOrderId: z.number().int().positive().optional(),
    vendorId: z.number().int().positive(),
    receivedDate: z.string().datetime().optional(),
    notes: z.string().max(500).optional(),
    items: z.array(goodsReceivedItemSchema).min(1, 'At least one item required'),
});

// GET /api/goods-received
export const getGoodsReceived = async (req: any, res: any) => {
    try {
        const tenantId = req.user.tenantId;
        const { vendorId, page = 1, limit = 20 } = req.query;
        const where: any = { tenantId };
        if (vendorId) where.vendorId = Number(vendorId);

        const [grns, total] = await Promise.all([
            prisma.goodsReceived.findMany({
                where,
                include: {
                    vendor: { select: { id: true, name: true } },
                    purchaseOrder: { select: { id: true, orderNumber: true } },
                    items: {
                        include: { product: { select: { id: true, name: true, productCode: true } } },
                    },
                    receiver: { select: { id: true, name: true } },
                },
                orderBy: { receivedDate: 'desc' },
                skip: (Number(page) - 1) * Number(limit),
                take: Number(limit),
            }),
            prisma.goodsReceived.count({ where }),
        ]);

        res.json({
            data: grns,
            pagination: {
                page: Number(page),
                limit: Number(limit),
                total,
                totalPages: Math.ceil(total / Number(limit)),
            },
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Failed to fetch goods received' });
    }
};

// POST /api/goods-received
export const createGoodsReceived = async (req: any, res: any) => {
    try {
        const tenantId = req.user.tenantId;
        const validation = goodsReceivedSchema.safeParse(req.body);
        if (!validation.success) {
            return res.status(400).json({ message: 'Validation error', errors: validation.error.issues });
        }

        const { purchaseOrderId, vendorId, receivedDate, notes, items } = validation.data;

        // Validate vendor and PO belong to tenant
        const vendor = await prisma.vendor.findFirst({ where: { id: vendorId, tenantId } });
        if (!vendor) return res.status(400).json({ message: 'Vendor not found' });

        if (purchaseOrderId) {
            const po = await prisma.purchaseOrder.findFirst({
                where: { id: purchaseOrderId, tenantId },
            });
            if (!po) return res.status(400).json({ message: 'Purchase order not found' });
        }

        // Verify all products exist
        const productIds = items.map(i => i.productId);
        const products = await prisma.product.findMany({ where: { id: { in: productIds }, tenantId } });
        if (products.length !== productIds.length) {
            return res.status(400).json({ message: 'One or more products not found' });
        }

        // Generate GRN number
        const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
        const count = await prisma.goodsReceived.count({ where: { tenantId } });
        const grnNumber = `GRN-${today}-${String(count + 1).padStart(3, '0')}`;

        // Use a transaction to create GRN, create stock movements, and update PO status
        const result = await prisma.$transaction(async (tx) => {
            // Create GRN
            const grn = await tx.goodsReceived.create({
                data: {
                    tenantId,
                    grnNumber,
                    purchaseOrderId: purchaseOrderId || null,
                    vendorId,
                    receivedDate: receivedDate ? new Date(receivedDate) : new Date(),
                    receivedBy: req.user.userId,
                    notes,
                    items: {
                        create: items.map(item => ({
                            productId: item.productId,
                            quantityReceived: item.quantityReceived,
                            purchaseOrderItemId: item.purchaseOrderItemId || null,
                        })),
                    },
                },
                include: {
                    items: { include: { product: true } },
                },
            });

            // For each received item, perform stock-in and create stock movement
            for (const item of items) {
                // Stock-in
                const currentStock = await tx.stock.upsert({
                    where: { productId: item.productId },
                    update: {},
                    create: { productId: item.productId, quantityOnHand: 0, reservedQuantity: 0 },
                });

                const newQty = currentStock.quantityOnHand + item.quantityReceived;

                // For average cost, we'd need unit price. We'll skip for simplicity (use 0 or average).
                await tx.stock.update({
                    where: { productId: item.productId },
                    data: { quantityOnHand: newQty },
                });

                await tx.stockMovement.create({
                    data: {
                        tenantId,
                        productId: item.productId,
                        type: 'STOCK_IN',
                        quantity: item.quantityReceived,
                        fromVendorId: vendorId,
                        referenceType: 'PURCHASE_ORDER',
                        referenceId: purchaseOrderId || null,
                        date: grn.receivedDate,
                        notes: `GRN ${grn.grnNumber}`,
                        createdBy: req.user.userId,
                    },
                });
            }

            // If PO is linked, check if all items are fully received → mark PARTIALLY_RECEIVED or COMPLETED
            if (purchaseOrderId) {
                const poItems = await tx.purchaseOrderItem.findMany({
                    where: { purchaseOrderId },
                });

                const receivedItems = await tx.goodsReceivedItem.findMany({
                    where: { goodsReceived: { purchaseOrderId } },
                    include: { goodsReceived: true },
                });

                // Simple logic: if any quantity received, set PARTIALLY_RECEIVED; we could improve to compare totals.
                const totalOrdered = poItems.reduce((sum, i) => sum + i.quantity, 0);
                const totalReceived = receivedItems.reduce((sum, i) => sum + i.quantityReceived, 0);

                if (totalReceived >= totalOrdered) {
                    await tx.purchaseOrder.update({
                        where: { id: purchaseOrderId },
                        data: { status: 'COMPLETED' },
                    });
                } else if (totalReceived > 0) {
                    await tx.purchaseOrder.update({
                        where: { id: purchaseOrderId },
                        data: { status: 'PARTIALLY_RECEIVED' },
                    });
                }
            }

            // Log activity
            await tx.activityLog.create({
                data: {
                    tenantId,
                    userId: req.user.userId,
                    action: 'GOODS_RECEIVED',
                    entityType: 'GoodsReceived',
                    entityId: grn.id,
                    details: { grnNumber },
                },
            });

            return grn;
        });

        res.status(201).json(result);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Failed to record goods received' });
    }
};