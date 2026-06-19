//backend\src\controllers\inventory.controller.ts
import prisma from '../lib/prisma';
import {
    stockInSchema,
    stockOutSchema,
} from '../validators/inventory.validator';

// ─── Helpers ──────────────────────────────────────────────────────────
const extractBrandFromNotes = (notes?: string): string | null => {
    if (!notes) return null;
    const match = notes.match(/Brand:\s*(.+)/);
    return match ? match[1].trim() : null;
};

// ─── Stock Overview ────────────────────────────────────────────────
export const getStockOverview = async (req: any, res: any) => {
    try {
        const tenantId = req.user.tenantId;
        const { search, categoryId, brandId, lowStock, page = 1, limit = 20 } = req.query;
        const skip = (Number(page) - 1) * Number(limit);

        const where: any = { tenantId };

        if (search) {
            where.OR = [
                { name: { contains: search, mode: 'insensitive' } },
            ];
        }
        if (categoryId) where.serviceCategoryId = Number(categoryId);
        if (brandId) {
            where.brands = { some: { brandId: Number(brandId) } };
        }

        const [products, total] = await Promise.all([
            prisma.product.findMany({
                where,
                include: {
                    serviceCategory: { select: { id: true, name: true } },
                    stock: true,
                    brands: { include: { brand: { select: { id: true, name: true } } } },
                },
                orderBy: { name: 'asc' },
                skip,
                take: Number(limit),
            }),
            prisma.product.count({ where }),
        ]);

        let data = products.map((p) => {
            const onHand = p.stock?.quantityOnHand ?? 0;
            const reserved = p.stock?.reservedQuantity ?? 0;
            const available = onHand - reserved;
            const brandNames = p.brands.map(pb => pb.brand.name).join(', ');
            return {
                id: p.id,
                productCode: p.productCode,    // <-- ADD THIS
                name: p.name,
                unit: p.unit,                  // <-- ensure unit is returned (already present)
                brand: brandNames || null,
                category: p.serviceCategory?.name,
                minStockLevel: p.minStockLevel,
                currentStock: onHand,
                reservedStock: reserved,
                availableStock: available,
                averageCost: p.stock?.averageCost,
                isLowStock: available < p.minStockLevel,
            };
        });

        if (lowStock === 'true') {
            data = data.filter((item) => item.isLowStock);
        }

        res.json({
            data,
            pagination: {
                page: Number(page),
                limit: Number(limit),
                total: lowStock === 'true' ? data.length : total,
                totalPages: Math.ceil((lowStock === 'true' ? data.length : total) / Number(limit)),
            },
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Failed to fetch stock overview' });
    }
};

// ─── Stock In ───────────────────────────────────────────────────────
export const stockIn = async (req: any, res: any) => {
    try {
        const tenantId = req.user.tenantId;
        const validation = stockInSchema.safeParse(req.body);
        if (!validation.success) {
            return res.status(400).json({ message: 'Validation error', errors: validation.error.issues });
        }

        const { productId, quantity, unitPrice, fromVendorId, projectId, referenceType, referenceId, notes } =
            validation.data;

        // ── Validate product ──
        const product = await prisma.product.findFirst({
            where: { id: productId, tenantId },
            include: { stock: true },
        });
        if (!product) return res.status(404).json({ message: 'Product not found' });

        // ── Validate vendor / project if provided ──
        if (fromVendorId) {
            const vendor = await prisma.vendor.findFirst({ where: { id: fromVendorId, tenantId } });
            if (!vendor) return res.status(400).json({ message: 'Vendor not found' });
        }
        if (projectId) {
            const project = await prisma.project.findFirst({ where: { id: projectId, tenantId } });
            if (!project) return res.status(400).json({ message: 'Project not found' });
        }

        // ── Brand linking ──
        const brandName = extractBrandFromNotes(notes);
        if (brandName) {
            const brand = await prisma.brand.findFirst({
                where: { tenantId, name: { equals: brandName, mode: 'insensitive' } },
            });
            if (brand) {
                const existing = await prisma.productBrand.findUnique({
                    where: { productId_brandId: { productId, brandId: brand.id } },
                });
                if (!existing) {
                    await prisma.productBrand.create({
                        data: { productId, brandId: brand.id },
                    });
                }
            }
        }

        // ── Stock transaction ──
        await prisma.$transaction(async (tx) => {
            const currentStock = await tx.stock.upsert({
                where: { productId },
                update: {},
                create: { productId, quantityOnHand: 0, reservedQuantity: 0 },
            });

            const newQty = currentStock.quantityOnHand + quantity;
            let newAvgCost = currentStock.averageCost ? Number(currentStock.averageCost) : undefined;

            if (unitPrice !== undefined) {
                if (newAvgCost === undefined) {
                    newAvgCost = unitPrice;
                } else {
                    const totalValue = currentStock.quantityOnHand * newAvgCost + quantity * unitPrice;
                    newAvgCost = totalValue / newQty;
                }
            }

            await tx.stock.update({
                where: { productId },
                data: {
                    quantityOnHand: newQty,
                    averageCost: newAvgCost !== undefined ? newAvgCost : undefined,
                },
            });

            await tx.stockMovement.create({
                data: {
                    tenantId,
                    productId,
                    type: 'STOCK_IN',
                    quantity,
                    unitPrice,
                    fromVendorId: fromVendorId || null,
                    toProjectId: projectId || null,
                    referenceType: referenceType || 'MANUAL_ADJUSTMENT',
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

// ─── Stock Out ──────────────────────────────────────────────────────
export const stockOut = async (req: any, res: any) => {
    try {
        const tenantId = req.user.tenantId;
        const validation = stockOutSchema.safeParse(req.body);
        if (!validation.success) {
            return res.status(400).json({ message: 'Validation error', errors: validation.error.issues });
        }

        const { productId, quantity, unitPrice, toProjectId, toCustomerId, referenceType, referenceId, notes } =
            validation.data;

        if (!toProjectId && !toCustomerId && referenceType !== 'MANUAL_ADJUSTMENT') {
            return res.status(400).json({ message: 'Specify either toProjectId or toCustomerId' });
        }

        const product = await prisma.product.findFirst({
            where: { id: productId, tenantId },
            include: { stock: true },
        });
        if (!product) return res.status(404).json({ message: 'Product not found' });

        const onHand = product.stock?.quantityOnHand ?? 0;
        const reserved = product.stock?.reservedQuantity ?? 0;
        const available = onHand - reserved;
        if (available < quantity) {
            return res.status(400).json({ message: 'Insufficient available stock' });
        }

        if (toProjectId) {
            const project = await prisma.project.findFirst({ where: { id: toProjectId, tenantId } });
            if (!project) return res.status(400).json({ message: 'Project not found' });
        }
        if (toCustomerId) {
            const customer = await prisma.customer.findFirst({ where: { id: toCustomerId, tenantId } });
            if (!customer) return res.status(400).json({ message: 'Customer not found' });
        }

        await prisma.$transaction(async (tx) => {
            // Decrease on-hand
            await tx.stock.update({
                where: { productId },
                data: { quantityOnHand: { decrement: quantity } },
            });

            // Reservation handling
            if (toProjectId) {
                const reservation = await tx.stockReservation.findFirst({
                    where: {
                        productId,
                        projectId: toProjectId,
                        status: 'PENDING',
                    },
                    orderBy: { createdAt: 'asc' },
                });

                if (reservation) {
                    const newReservedQty = Math.max(reservation.quantity - quantity, 0);
                    const fulfilled = reservation.quantity - newReservedQty;
                    await tx.stockReservation.update({
                        where: { id: reservation.id },
                        data: {
                            quantity: newReservedQty,
                            status: newReservedQty === 0 ? 'FULFILLED' : 'PENDING',
                        },
                    });
                    await tx.stock.update({
                        where: { productId },
                        data: { reservedQuantity: { decrement: fulfilled } },
                    });
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
                    referenceType: referenceType || 'PROJECT',
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

// ─── Movements (List, Edit, Delete) ──────────────────────────────
export const getMovements = async (req: any, res: any) => {
    try {
        const tenantId = req.user.tenantId;
        const { productId, type, page = 1, limit = 20 } = req.query;
        const where: any = { tenantId };

        if (productId && productId !== '0') where.productId = Number(productId);
        if (type && type !== '0') where.type = type.toUpperCase();

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
            include: { product: { include: { stock: true } } },
        });
        if (!movement) return res.status(404).json({ message: 'Movement not found' });

        // Prevent editing if type is ADJUSTMENT (or we can allow but it's tricky)
        // We'll allow editing STOCK_IN and STOCK_OUT only.
        if (movement.type === 'ADJUSTMENT') {
            return res.status(400).json({ message: 'Adjustment movements cannot be edited' });
        }

        // Build update data
        const updateData: any = {};
        let stockDelta = 0;

        if (unitPrice !== undefined) {
            updateData.unitPrice = unitPrice;
        }
        if (notes !== undefined) {
            updateData.notes = notes;
        }

        // Handle quantity change – adjust stock balance
        if (quantity !== undefined && quantity !== movement.quantity) {
            const diff = quantity - movement.quantity;
            // For STOCK_IN, increasing quantity adds to stock; decreasing subtracts
            // For STOCK_OUT, increasing quantity subtracts more; decreasing adds back
            if (movement.type === 'STOCK_IN') {
                stockDelta = diff; // positive = add, negative = subtract
            } else if (movement.type === 'STOCK_OUT') {
                stockDelta = -diff; // positive = add back, negative = subtract more
            }
            updateData.quantity = quantity;
        }

        // Update references (fromVendorId / toProjectId / toCustomerId)
        if (movement.type === 'STOCK_IN') {
            if (fromVendorId !== undefined) {
                updateData.fromVendorId = fromVendorId ? parseInt(fromVendorId) : null;
            }
        } else if (movement.type === 'STOCK_OUT') {
            if (toProjectId !== undefined) {
                updateData.toProjectId = toProjectId ? parseInt(toProjectId) : null;
            }
            if (toCustomerId !== undefined) {
                updateData.toCustomerId = toCustomerId ? parseInt(toCustomerId) : null;
            }
        }

        // Perform update and stock adjustment in transaction
        await prisma.$transaction(async (tx) => {
            // Update movement
            await tx.stockMovement.update({
                where: { id: movementId },
                data: updateData,
            });

            // Adjust stock if quantity changed
            if (stockDelta !== 0) {
                const currentStock = movement.product.stock;
                if (!currentStock) {
                    // Should not happen, but create if missing
                    await tx.stock.create({
                        data: {
                            productId: movement.productId,
                            quantityOnHand: stockDelta > 0 ? stockDelta : 0,
                            reservedQuantity: 0,
                        },
                    });
                } else {
                    const newOnHand = currentStock.quantityOnHand + stockDelta;
                    if (newOnHand < 0) {
                        throw new Error('Insufficient stock for quantity change');
                    }
                    await tx.stock.update({
                        where: { productId: movement.productId },
                        data: { quantityOnHand: newOnHand },
                    });
                }
            }

            // If unitPrice changed, we could optionally recalc average cost – not implemented for simplicity
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
            include: { product: { include: { stock: true } } },
        });
        if (!movement) return res.status(404).json({ message: 'Movement not found' });

        // Reverse the effect of this movement on stock
        let stockDelta = 0;
        if (movement.type === 'STOCK_IN') {
            stockDelta = -movement.quantity; // remove the stock that was added
        } else if (movement.type === 'STOCK_OUT') {
            stockDelta = movement.quantity; // add back the stock that was removed
        } else {
            // For ADJUSTMENT, we need to reverse the effect – but let's decide not to allow deletion of adjustments
            return res.status(400).json({ message: 'Cannot delete adjustment movements' });
        }

        await prisma.$transaction(async (tx) => {
            // Delete the movement
            await tx.stockMovement.delete({ where: { id: movementId } });

            // Adjust stock
            const currentStock = movement.product.stock;
            if (currentStock) {
                const newOnHand = currentStock.quantityOnHand + stockDelta;
                if (newOnHand < 0) {
                    throw new Error('Deleting this movement would result in negative stock');
                }
                await tx.stock.update({
                    where: { productId: movement.productId },
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