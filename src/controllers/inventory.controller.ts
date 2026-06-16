import prisma from '../lib/prisma';
import {
    stockInSchema,
    stockOutSchema,
    adjustmentSchema,
    reservationSchema,
} from '../validators/inventory.validator';

// ---------------- Stock Overview ----------------
export const getStockOverview = async (req: any, res: any) => {
    try {
        const tenantId = req.user.tenantId;
        const { search, categoryId, brandId, lowStock, page = 1, limit = 20 } = req.query;
        const skip = (Number(page) - 1) * Number(limit);

        const where: any = { tenantId };

        if (search) {
            where.OR = [
                { name: { contains: search, mode: 'insensitive' } },
                { productCode: { contains: search, mode: 'insensitive' } },
                { sku: { contains: search, mode: 'insensitive' } },
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
                    brands: {
                        include: { brand: { select: { id: true, name: true } } }
                    }
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
                productCode: p.productCode,
                name: p.name,
                sku: p.sku,
                brand: brandNames || null,
                category: p.serviceCategory,
                unit: p.unit,
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

// ---------------- Low Stock Alerts (FIXED) ----------------
export const getLowStockAlerts = async (req: any, res: any) => {
    try {
        const tenantId = req.user.tenantId;
        const products = await prisma.product.findMany({
            where: { tenantId },
            include: {
                stock: true,
                serviceCategory: true,
                brands: {
                    include: { brand: { select: { id: true, name: true } } }
                }
            },
        });

        const alerts = products
            .map((p) => {
                const onHand = p.stock?.quantityOnHand ?? 0;
                const reserved = p.stock?.reservedQuantity ?? 0;
                const available = onHand - reserved;
                const brandNames = p.brands.map(pb => pb.brand.name).join(', ');
                return {
                    id: p.id,
                    productCode: p.productCode,
                    name: p.name,
                    brand: brandNames || null,
                    category: p.serviceCategory?.name,
                    minStockLevel: p.minStockLevel,
                    currentStock: onHand,
                    reservedStock: reserved,
                    availableStock: available,
                    averageCost: p.stock?.averageCost,
                };
            })
            .filter((item) => item.availableStock < item.minStockLevel);

        res.json(alerts);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Failed to fetch low stock alerts' });
    }
};

// ---------------- Stock In (unchanged) ----------------
// ---------------- Stock In (with brand linking) ----------------
export const stockIn = async (req: any, res: any) => {
    try {
        const tenantId = req.user.tenantId;
        const validation = stockInSchema.safeParse(req.body);
        if (!validation.success) {
            return res.status(400).json({ message: 'Validation error', errors: validation.error.issues });
        }

        const { productId, quantity, unitPrice, fromVendorId, projectId, referenceType, referenceId, notes } = validation.data;

        const product = await prisma.product.findFirst({
            where: { id: productId, tenantId },
            include: { stock: true },
        });
        if (!product) return res.status(404).json({ message: 'Product not found' });

        // ---------- BRAND LINKING ----------
        if (notes && notes.includes('Brand:')) {
            const brandMatch = notes.match(/Brand:\s*(.+)/);
            if (brandMatch) {
                const brandName = brandMatch[1].trim();
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
            }
        }
        // ---------- END BRAND LINKING ----------

        // Validate vendor/project...
        if (fromVendorId) {
            const vendor = await prisma.vendor.findFirst({ where: { id: fromVendorId, tenantId } });
            if (!vendor) return res.status(400).json({ message: 'Vendor not found' });
        }
        if (projectId) {
            const project = await prisma.project.findFirst({ where: { id: projectId, tenantId } });
            if (!project) return res.status(400).json({ message: 'Project not found' });
        }

        // Continue with stock transaction...
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
                    const totalValue = (currentStock.quantityOnHand * newAvgCost) + (quantity * unitPrice);
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

// ---------------- Stock Out (unchanged) ----------------
export const stockOut = async (req: any, res: any) => {
    try {
        const tenantId = req.user.tenantId;
        const validation = stockOutSchema.safeParse(req.body);
        if (!validation.success) {
            return res.status(400).json({ message: 'Validation error', errors: validation.error.issues });
        }

        const { productId, quantity, unitPrice, toProjectId, toCustomerId, referenceType, referenceId, notes } = validation.data;

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
            await tx.stock.update({
                where: { productId },
                data: { quantityOnHand: { decrement: quantity } },
            });

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

// ---------------- Adjustment (unchanged) ----------------
export const adjustment = async (req: any, res: any) => {
    try {
        const tenantId = req.user.tenantId;
        const validation = adjustmentSchema.safeParse(req.body);
        if (!validation.success) {
            return res.status(400).json({ message: 'Validation error', errors: validation.error.issues });
        }

        const { productId, quantity, notes } = validation.data;
        const product = await prisma.product.findFirst({
            where: { id: productId, tenantId },
            include: { stock: true },
        });
        if (!product) return res.status(404).json({ message: 'Product not found' });

        const currentOnHand = product.stock?.quantityOnHand ?? 0;
        const newOnHand = currentOnHand + quantity;
        if (newOnHand < 0) {
            return res.status(400).json({ message: 'Adjustment would result in negative stock' });
        }

        await prisma.$transaction(async (tx) => {
            await tx.stock.upsert({
                where: { productId },
                update: { quantityOnHand: newOnHand },
                create: { productId, quantityOnHand: Math.max(newOnHand, 0), reservedQuantity: 0 },
            });

            await tx.stockMovement.create({
                data: {
                    tenantId,
                    productId,
                    type: 'ADJUSTMENT',
                    quantity: Math.abs(quantity),
                    referenceType: 'MANUAL_ADJUSTMENT',
                    date: new Date(),
                    notes: notes || (quantity > 0 ? 'Positive adjustment' : 'Negative adjustment'),
                    createdBy: req.user.userId,
                },
            });
        });

        await prisma.activityLog.create({
            data: {
                tenantId,
                userId: req.user.userId,
                action: 'ADJUSTMENT',
                entityType: 'Product',
                entityId: productId,
                details: { quantity },
            },
        });

        res.json({ message: 'Stock adjusted successfully' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Failed to process adjustment' });
    }
};

// ---------------- Reservations (unchanged) ----------------
export const getReservations = async (req: any, res: any) => {
    try {
        const tenantId = req.user.tenantId;
        const { projectId, status, page = 1, limit = 20 } = req.query;
        const where: any = { product: { tenantId } };

        if (projectId) where.projectId = Number(projectId);
        if (status) where.status = status.toUpperCase();

        const [reservations, total] = await Promise.all([
            prisma.stockReservation.findMany({
                where,
                include: {
                    product: { select: { id: true, productCode: true, name: true } },
                    project: { select: { id: true, name: true } },
                },
                orderBy: { createdAt: 'desc' },
                skip: (Number(page) - 1) * Number(limit),
                take: Number(limit),
            }),
            prisma.stockReservation.count({ where }),
        ]);

        res.json({
            data: reservations,
            pagination: {
                page: Number(page),
                limit: Number(limit),
                total,
                totalPages: Math.ceil(total / Number(limit)),
            },
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Failed to fetch reservations' });
    }
};

export const reserveStock = async (req: any, res: any) => {
    try {
        const tenantId = req.user.tenantId;
        const validation = reservationSchema.safeParse(req.body);
        if (!validation.success) {
            return res.status(400).json({ message: 'Validation error', errors: validation.error.issues });
        }

        const { productId, projectId, quantity } = validation.data;

        const product = await prisma.product.findFirst({
            where: { id: productId, tenantId },
            include: { stock: true },
        });
        if (!product) return res.status(404).json({ message: 'Product not found' });

        const project = await prisma.project.findFirst({ where: { id: projectId, tenantId } });
        if (!project) return res.status(404).json({ message: 'Project not found' });

        const onHand = product.stock?.quantityOnHand ?? 0;
        const reserved = product.stock?.reservedQuantity ?? 0;
        const available = onHand - reserved;

        if (available < quantity) {
            return res.status(400).json({ message: 'Insufficient available stock to reserve' });
        }

        await prisma.$transaction(async (tx) => {
            await tx.stock.upsert({
                where: { productId },
                update: { reservedQuantity: { increment: quantity } },
                create: { productId, quantityOnHand: 0, reservedQuantity: quantity },
            });

            await tx.stockReservation.create({
                data: { productId, projectId, quantity, status: 'PENDING' },
            });
        });

        res.json({ message: 'Stock reserved successfully' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Failed to reserve stock' });
    }
};

export const releaseReservation = async (req: any, res: any) => {
    try {
        const tenantId = req.user.tenantId;
        const reservationId = Number(req.params.id);

        const reservation = await prisma.stockReservation.findFirst({
            where: { id: reservationId, product: { tenantId } },
            include: { product: true },
        });
        if (!reservation) return res.status(404).json({ message: 'Reservation not found' });

        if (reservation.status !== 'PENDING') {
            return res.status(400).json({ message: 'Only pending reservations can be released' });
        }

        await prisma.$transaction(async (tx) => {
            await tx.stock.update({
                where: { productId: reservation.productId },
                data: { reservedQuantity: { decrement: reservation.quantity } },
            });
            await tx.stockReservation.update({
                where: { id: reservationId },
                data: { status: 'CANCELLED' },
            });
        });

        res.json({ message: 'Reservation released' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Failed to release reservation' });
    }
};

// ---------------- Movements History (unchanged) ----------------
export const getMovements = async (req: any, res: any) => {
    try {
        const tenantId = req.user.tenantId;
        const { productId, type, page = 1, limit = 20 } = req.query;
        const where: any = { tenantId };

        if (productId) where.productId = Number(productId);
        if (type) where.type = type.toUpperCase();

        const [movements, total] = await Promise.all([
            prisma.stockMovement.findMany({
                where,
                include: {
                    product: { select: { id: true, productCode: true, name: true } },
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


// backend/src/controllers/inventory.controller.ts

// ... (existing imports and functions remain unchanged) ...

// ─── Update Movement (Edit) ──────────────────────────────────
// backend/src/controllers/inventory.controller.ts

export const updateMovement = async (req: any, res: any) => {
    try {
        const tenantId = req.user.tenantId;
        const movementId = parseInt(req.params.id);

        // Validate request body
        const { quantity, unitPrice, notes, fromVendorId, toProjectId, toCustomerId } = req.body;
        if (Object.keys(req.body).length === 0) {
            return res.status(400).json({ message: 'No fields to update' });
        }

        // Fetch existing movement
        const existingMovement = await prisma.stockMovement.findFirst({
            where: { id: movementId, tenantId },
            include: { product: { include: { stock: true } } },
        });
        if (!existingMovement) {
            return res.status(404).json({ message: 'Movement not found' });
        }

        // Validate foreign keys if provided
        if (fromVendorId !== undefined && fromVendorId !== null) {
            const vendor = await prisma.vendor.findFirst({ where: { id: fromVendorId, tenantId } });
            if (!vendor) return res.status(400).json({ message: 'Vendor not found' });
        }
        if (toProjectId !== undefined && toProjectId !== null) {
            const project = await prisma.project.findFirst({ where: { id: toProjectId, tenantId } });
            if (!project) return res.status(400).json({ message: 'Project not found' });
        }
        if (toCustomerId !== undefined && toCustomerId !== null) {
            const customer = await prisma.customer.findFirst({ where: { id: toCustomerId, tenantId } });
            if (!customer) return res.status(400).json({ message: 'Customer not found' });
        }

        // Prepare update data
        const updateData: any = {};
        if (quantity !== undefined) updateData.quantity = quantity;
        if (unitPrice !== undefined) updateData.unitPrice = unitPrice;
        if (notes !== undefined) updateData.notes = notes;
        if (fromVendorId !== undefined) updateData.fromVendorId = fromVendorId || null;
        if (toProjectId !== undefined) updateData.toProjectId = toProjectId || null;
        if (toCustomerId !== undefined) updateData.toCustomerId = toCustomerId || null;

        // If quantity is changing, adjust stock
        let quantityDelta = 0;
        if (quantity !== undefined && quantity !== existingMovement.quantity) {
            quantityDelta = quantity - existingMovement.quantity;
        }

        await prisma.$transaction(async (tx) => {
            // Adjust stock if quantity changed
            if (quantityDelta !== 0) {
                const stock = await tx.stock.findUnique({
                    where: { productId: existingMovement.productId },
                });
                if (!stock) throw new Error('Stock record not found');

                let newOnHand = stock.quantityOnHand;
                if (existingMovement.type === 'STOCK_IN') {
                    newOnHand += quantityDelta;
                } else if (existingMovement.type === 'STOCK_OUT') {
                    newOnHand -= quantityDelta;
                } else if (existingMovement.type === 'ADJUSTMENT') {
                    newOnHand += quantityDelta;
                }
                if (newOnHand < 0) throw new Error('Insufficient stock after update');

                await tx.stock.update({
                    where: { productId: existingMovement.productId },
                    data: { quantityOnHand: newOnHand },
                });
            }

            // Update movement record
            await tx.stockMovement.update({
                where: { id: movementId },
                data: updateData,
            });
        });

        // Log activity
        await prisma.activityLog.create({
            data: {
                tenantId,
                userId: req.user.userId,
                action: 'UPDATE',
                entityType: 'StockMovement',
                entityId: movementId,
                details: { changes: req.body },
            },
        });

        res.json({ message: 'Movement updated successfully' });
    } catch (error: any) {
        console.error(error);
        res.status(500).json({ message: error.message || 'Failed to update movement' });
    }
};
// ─── Delete Movement (with reversal) ─────────────────────────
export const deleteMovement = async (req: any, res: any) => {
    try {
        const tenantId = req.user.tenantId;
        const movementId = parseInt(req.params.id);

        // Fetch the movement with product and stock
        const movement = await prisma.stockMovement.findFirst({
            where: { id: movementId, tenantId },
            include: { product: { include: { stock: true } } },
        });
        if (!movement) {
            return res.status(404).json({ message: 'Movement not found' });
        }

        // Start transaction to reverse effect and delete
        await prisma.$transaction(async (tx) => {
            const stock = await tx.stock.findUnique({
                where: { productId: movement.productId },
            });
            if (!stock) {
                throw new Error('Stock record not found');
            }

            // Reverse the effect based on type
            let newOnHand = stock.quantityOnHand;
            if (movement.type === 'STOCK_IN') {
                newOnHand -= movement.quantity;
            } else if (movement.type === 'STOCK_OUT') {
                newOnHand += movement.quantity;
            } else if (movement.type === 'ADJUSTMENT') {
                newOnHand -= movement.quantity;
            }

            if (newOnHand < 0) {
                throw new Error('Cannot delete: stock would become negative');
            }

            await tx.stock.update({
                where: { productId: movement.productId },
                data: { quantityOnHand: newOnHand },
            });

            // If STOCK_OUT and it fulfilled reservations, we may need to restore them
            // For simplicity, we only delete the movement and leave reservations as is.
            // However, if the movement has a reference to a reservation, we could revert it.
            // We'll skip this for now and assume manual correction later.

            // Delete the movement
            await tx.stockMovement.delete({
                where: { id: movementId },
            });
        });

        // Log activity
        await prisma.activityLog.create({
            data: {
                tenantId,
                userId: req.user.userId,
                action: 'DELETE',
                entityType: 'StockMovement',
                entityId: movementId,
                details: { deleted: movement },
            },
        });

        res.json({ message: 'Movement deleted successfully' });
    } catch (error: any) {
        console.error(error);
        res.status(500).json({ message: error.message || 'Failed to delete movement' });
    }
};