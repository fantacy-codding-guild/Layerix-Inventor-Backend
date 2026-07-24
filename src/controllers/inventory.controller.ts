import prisma from '../lib/prisma';
import {
    stockInSchema,
    stockOutSchema,
} from '../validators/inventory.validator';
import { ReferenceType } from '@prisma/client';

// ─── Helpers ─────────────────────────────────────────────
const extractBrandFromNotes = (notes?: string): string | null => {
    if (!notes) return null;
    const match = notes.match(/Brand:\s*([^\n]+)/);
    return match ? match[1].trim() : null;
};

// ─── Stock Overview ──────────────────────────────────────
export const getStockOverview = async (req: any, res: any) => {
    try {
        const tenantId = req.user.tenantId;
        const { search, categoryId, brandId, page = 1, limit = 20 } = req.query;
        const skip = (Number(page) - 1) * Number(limit);

        const where: any = { tenantId };

        if (search) {
            where.OR = [
                { product: { name: { contains: search, mode: 'insensitive' } } },
                { product: { productCode: { contains: search, mode: 'insensitive' } } },
            ];
        }
        if (brandId && brandId !== '0') {
            const brand = await prisma.brand.findFirst({ where: { id: Number(brandId), tenantId } });
            if (brand) where.brand = brand.name;
        }
        if (categoryId) {
            where.product = { ...(where.product || {}), serviceCategoryId: Number(categoryId) };
        }

        const allItems = await prisma.inventoryItem.findMany({
            where,
            include: {
                product: { select: { id: true, name: true, productCode: true, minStockLevel: true, unit: true } },
                vendor: { select: { id: true, name: true } },
            },
        });

        const totalProducts = allItems.length;
        const totalValue = allItems.reduce(
            (sum, item) => sum + item.quantityOnHand * (Number(item.averageCost) || 0),
            0
        );
        const totalUnits = allItems.reduce((sum, item) => sum + item.quantityOnHand, 0);
        const lowStockCount = allItems.filter(item => {
            const available = item.quantityOnHand - item.reservedQuantity;
            return available < item.product.minStockLevel;
        }).length;

        const [paginated, total] = await Promise.all([
            prisma.inventoryItem.findMany({
                where,
                include: {
                    product: { select: { id: true, name: true, productCode: true, minStockLevel: true, unit: true } },
                    vendor: { select: { id: true, name: true } },
                },
                orderBy: { product: { name: 'asc' } },
                skip,
                take: Number(limit),
            }),
            prisma.inventoryItem.count({ where }),
        ]);

        const data = paginated.map(item => ({
            id: item.id,
            productId: item.productId,
            name: item.product.name,
            productCode: item.product.productCode,
            brand: item.brand,
            unit: item.unit,
            vendor: item.vendor?.name || null,
            vendorId: item.vendorId,
            minStockLevel: item.product.minStockLevel,
            currentStock: item.quantityOnHand,
            reservedStock: item.reservedQuantity,
            availableStock: item.quantityOnHand - item.reservedQuantity,
            averageCost: item.averageCost,
            isLowStock: (item.quantityOnHand - item.reservedQuantity) < item.product.minStockLevel,
        }));

        res.json({
            data,
            pagination: {
                page: Number(page),
                limit: Number(limit),
                total,
                totalPages: Math.ceil(total / Number(limit)),
            },
            totals: {
                totalProducts,
                totalValue,
                totalUnits,
                lowStockCount,
            },
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Failed to fetch stock overview' });
    }
};

// ─── Stock In ─────────────────────────────────────────────
export const stockIn = async (req: any, res: any) => {
    try {
        const tenantId = req.user.tenantId;
        const validation = stockInSchema.safeParse(req.body);
        if (!validation.success) {
            return res.status(400).json({ message: 'Validation error', errors: validation.error.issues });
        }

        const { productId, quantity, unitPrice, fromVendorId, projectId, referenceType, referenceId, notes } =
            validation.data;

        const product = await prisma.product.findFirst({
            where: { id: productId, tenantId },
        });
        if (!product) return res.status(404).json({ message: 'Product not found' });

        if (fromVendorId) {
            const vendor = await prisma.vendor.findFirst({ where: { id: fromVendorId, tenantId } });
            if (!vendor) return res.status(400).json({ message: 'Vendor not found' });
        }
        if (projectId) {
            const project = await prisma.project.findFirst({ where: { id: projectId, tenantId } });
            if (!project) return res.status(400).json({ message: 'Project not found' });
        }

        const brandName = extractBrandFromNotes(notes) || 'Unknown';
        const unit = product.unit;

        await prisma.$transaction(async (tx) => {
            const existingItem = await tx.inventoryItem.findFirst({
                where: {
                    tenantId,
                    productId,
                    unit,
                    vendorId: fromVendorId || null,
                },
            });

            if (existingItem) {
                await tx.inventoryItem.update({
                    where: { id: existingItem.id },
                    data: {
                        brand: brandName,
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

            // Determine reference type: if fromVendorId is present, it's a purchase order
            const refType = fromVendorId
                ? (referenceType ?? ReferenceType.PURCHASE_ORDER)
                : (referenceType ?? ReferenceType.MANUAL_ADJUSTMENT);

            await tx.stockMovement.create({
                data: {
                    tenantId,
                    productId,
                    type: 'STOCK_IN',
                    quantity,
                    unitPrice,
                    fromVendorId: fromVendorId || null,
                    toProjectId: projectId || null,
                    referenceType: refType,
                    referenceId: referenceId || null,
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
                action: 'STOCK_IN',
                entityType: 'Product',
                entityId: productId,
                details: { quantity, unitPrice, fromVendorId, projectId },
            },
        });

        res.json({ message: 'Stock increased successfully' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Failed to process stock in' });
    }
};

// ─── Stock Out ────────────────────────────────────────────
export const stockOut = async (req: any, res: any) => {
    try {
        const tenantId = req.user.tenantId;
        const validation = stockOutSchema.safeParse(req.body);
        if (!validation.success) {
            return res.status(400).json({
                message: 'Validation error',
                errors: validation.error.issues,
            });
        }

        const {
            productId, quantity, unitPrice,
            toProjectId, toCustomerId,
            referenceType, referenceId, notes,
            brand, unit, vendorId,
        } = validation.data;

        const cleanBrand = brand.trim();
        const cleanUnit = unit.trim();

        if (!toProjectId && !toCustomerId && referenceType !== 'MANUAL_ADJUSTMENT') {
            return res.status(400).json({ message: 'Specify either toProjectId or toCustomerId' });
        }

        const inventoryItem = await prisma.inventoryItem.findFirst({
            where: {
                tenantId,
                productId,
                brand: cleanBrand,
                unit: cleanUnit,
                vendorId: vendorId || null,
            },
        });

        if (!inventoryItem) return res.status(404).json({ message: 'Inventory item not found' });

        const available = inventoryItem.quantityOnHand - inventoryItem.reservedQuantity;
        if (available < quantity) {
            return res.status(400).json({ message: 'Insufficient available stock' });
        }

        await prisma.$transaction(async (tx) => {
            await tx.inventoryItem.update({
                where: { id: inventoryItem.id },
                data: { quantityOnHand: { decrement: quantity } },
            });

            // Determine reference type:
            // - If toCustomerId is set, it's an OFFICE_ISSUE (sale or transfer to customer)
            // - If toProjectId is set, it's also OFFICE_ISSUE (office stock leaves to project)
            // - Otherwise, fallback to MANUAL_ADJUSTMENT
            let refType = referenceType;
            if (!refType) {
                if (toCustomerId) {
                    refType = ReferenceType.OFFICE_ISSUE;
                } else if (toProjectId) {
                    refType = ReferenceType.OFFICE_ISSUE;
                } else {
                    refType = ReferenceType.MANUAL_ADJUSTMENT;
                }
            }

            await tx.stockMovement.create({
                data: {
                    tenantId,
                    productId,
                    type: 'STOCK_OUT',
                    quantity,
                    unitPrice,
                    toProjectId: toProjectId || null,
                    toCustomerId: toCustomerId || null,
                    referenceType: refType,
                    referenceId: referenceId || null,
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
                action: 'STOCK_OUT',
                entityType: 'Product',
                entityId: productId,
                details: { quantity, unitPrice, toProjectId, toCustomerId },
            },
        });

        res.json({ message: 'Stock decreased successfully' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Failed to process stock out' });
    }
};

// ─── Movements (list, edit, delete) ──────────────────────
export const getMovements = async (req: any, res: any) => {
    try {
        const tenantId = req.user.tenantId;
        const { productId, type, page = 1, limit = 20, scope } = req.query;
        const where: any = { tenantId };

        if (productId && productId !== '0') where.productId = Number(productId);
        if (type && type !== '0') where.type = type.toUpperCase();

        // 🔥 If scope is 'office', exclude project‑only reference types
        if (scope === 'office') {
            where.referenceType = {
                notIn: [
                    'PROJECT_ORDER',
                    'PROJECT_CONSUME',
                    'PROJECT_RETURN',
                ],
            };
        }

        const [movements, total] = await Promise.all([
            prisma.stockMovement.findMany({
                where,
                include: {
                    product: { select: { id: true, name: true } },
                    fromVendor: { select: { id: true, name: true } },
                    toProject: { select: { id: true, name: true } },
                    toCustomer: { select: { id: true, name: true } },
                    user: { select: { id: true, name: true } },
                },
                orderBy: { date: 'desc' },
                skip: (Number(page) - 1) * Number(limit),
                take: Number(limit),
            }),
            prisma.stockMovement.count({ where }),
        ]);

        res.json({
            data: movements,
            pagination: {
                page: Number(page),
                limit: Number(limit),
                total,
                totalPages: Math.ceil(total / Number(limit)),
            },
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Failed to fetch stock movements' });
    }
};

export const updateMovement = async (req: any, res: any) => {
    try {
        const tenantId = req.user.tenantId;
        const movementId = parseInt(req.params.id);
        const { quantity, unitPrice, notes, fromVendorId, toProjectId, toCustomerId } = req.body;

        const movement = await prisma.stockMovement.findFirst({
            where: { id: movementId, tenantId },
            include: { product: { include: { inventoryItems: true } } },
        });
        if (!movement) return res.status(404).json({ message: 'Movement not found' });

        if (movement.type === 'ADJUSTMENT') {
            return res.status(400).json({ message: 'Adjustment movements cannot be edited' });
        }

        const updateData: any = {};
        let stockDelta = 0;

        if (unitPrice !== undefined) updateData.unitPrice = unitPrice;
        if (notes !== undefined) updateData.notes = notes;

        if (quantity !== undefined && quantity !== movement.quantity) {
            const diff = quantity - movement.quantity;
            stockDelta = movement.type === 'STOCK_IN' ? diff : -diff;
            updateData.quantity = quantity;
        }

        if (movement.type === 'STOCK_IN' && fromVendorId !== undefined) {
            updateData.fromVendorId = fromVendorId ? parseInt(fromVendorId) : null;
        }
        if (movement.type === 'STOCK_OUT') {
            if (toProjectId !== undefined) updateData.toProjectId = toProjectId ? parseInt(toProjectId) : null;
            if (toCustomerId !== undefined) updateData.toCustomerId = toCustomerId ? parseInt(toCustomerId) : null;
        }

        await prisma.$transaction(async (tx) => {
            await tx.stockMovement.update({ where: { id: movementId }, data: updateData });

            if (stockDelta !== 0) {
                const item = await tx.inventoryItem.findFirst({
                    where: { tenantId, productId: movement.productId },
                });
                if (item) {
                    const newOnHand = item.quantityOnHand + stockDelta;
                    if (newOnHand < 0) throw new Error('Insufficient stock for quantity change');
                    await tx.inventoryItem.update({
                        where: { id: item.id },
                        data: { quantityOnHand: newOnHand },
                    });
                }
            }

            if (movement.type === 'STOCK_IN' && unitPrice !== undefined) {
                const item = await tx.inventoryItem.findFirst({
                    where: { tenantId, productId: movement.productId },
                });
                if (item) {
                    await tx.inventoryItem.update({
                        where: { id: item.id },
                        data: { averageCost: unitPrice },
                    });
                }
            }
        });

        res.json({ message: 'Movement updated successfully' });
    } catch (error: any) {
        console.error(error);
        res.status(500).json({ message: error.message || 'Failed to update movement' });
    }
};

export const deleteMovement = async (req: any, res: any) => {
    try {
        const tenantId = req.user.tenantId;
        const movementId = parseInt(req.params.id);

        const movement = await prisma.stockMovement.findFirst({
            where: { id: movementId, tenantId },
            include: { product: { include: { inventoryItems: true } } },
        });
        if (!movement) return res.status(404).json({ message: 'Movement not found' });

        if (movement.type === 'ADJUSTMENT') {
            return res.status(400).json({ message: 'Cannot delete adjustment movements' });
        }

        const stockDelta = movement.type === 'STOCK_IN' ? -movement.quantity : movement.quantity;

        await prisma.$transaction(async (tx) => {
            await tx.stockMovement.delete({ where: { id: movementId } });

            const item = await tx.inventoryItem.findFirst({
                where: { tenantId, productId: movement.productId },
            });
            if (item) {
                const newOnHand = item.quantityOnHand + stockDelta;
                if (newOnHand < 0) throw new Error('Deleting this movement would result in negative stock');
                await tx.inventoryItem.update({
                    where: { id: item.id },
                    data: { quantityOnHand: newOnHand },
                });
            }
        });

        await prisma.activityLog.create({
            data: {
                tenantId,
                userId: req.user.userId,
                action: 'DELETE',
                entityType: 'StockMovement',
                entityId: movementId,
                details: { type: movement.type, quantity: movement.quantity },
            },
        });

        res.json({ message: 'Movement deleted and stock adjusted' });
    } catch (error: any) {
        console.error(error);
        res.status(500).json({ message: error.message || 'Failed to delete movement' });
    }
};