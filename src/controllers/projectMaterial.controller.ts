// backend/src/controllers/projectMaterial.controller.ts
import prisma from '../lib/prisma';
import { z } from 'zod';
import { Prisma, ReferenceType } from '@prisma/client';

// ─── Helpers ─────────────────────────────────────────────
const extractBrandFromNotes = (notes?: string): string | null => {
    if (!notes) return null;
    const match = notes.match(/Brand:\s*([^\n]+)/);
    return match ? match[1].trim() : null;
};

const extractUnitFromNotes = (notes?: string): string | null => {
    if (!notes) return null;
    const match = notes.match(/Unit:\s*([^\n]+)/);
    return match ? match[1].trim() : null;
};

const extractModelFromNotes = (notes?: string): string | null => {
    if (!notes) return null;
    const match = notes.match(/Model:\s*([^\n]+)/);
    return match ? match[1].trim() : null;
};
// ─── Validation schemas ──────────────────────────────────
const orderSchema = z.object({
    productId: z.number().int(),
    quantity: z.number().int().positive(),
    unitPrice: z.number().positive(),
    fromVendorId: z.number().int().positive(),
    unit: z.string().min(1, 'Unit is required'),
    notes: z.string().optional(),
});

const consumeSchema = z.object({
    productId: z.number().int(),
    quantity: z.number().int().positive(),
    unit: z.string().min(1, 'Unit is required'),
    notes: z.string().optional(),
});

const transferOutSchema = z.object({
    productId: z.number().int(),
    quantity: z.number().int().positive(),
    unit: z.string().min(1, 'Unit is required'),
    notes: z.string().optional(),
});

// ─── Types ──────────────────────────────────────────────
interface ProductStat {
    product: { id: number; name: string; unit: string };
    ordered: number;
    consumed: number;
    returned: number;
    remaining: number;
    orderedValue: number;
    brand: string | null;
}

// ─── Order material ──────────────────────────────────────
export const orderMaterial = async (req: any, res: any) => {
    const startTime = Date.now();
    try {
        const tenantId = req.user.tenantId;
        const projectId = parseInt(req.params.id);

        if (!tenantId || !projectId) {
            return res.status(400).json({ message: 'Invalid tenant or project ID' });
        }

        const validation = orderSchema.safeParse(req.body);
        if (!validation.success) {
            return res.status(400).json({
                message: 'Validation error',
                errors: validation.error.issues.map((i) => ({
                    field: i.path.join('.'),
                    message: i.message,
                })),
            });
        }

        const { productId, quantity, unitPrice, fromVendorId, unit, notes } = validation.data;

        // Fetch project, product, vendor in parallel
        const [project, product, vendor] = await Promise.all([
            prisma.project.findFirst({ where: { id: projectId, tenantId } }),
            prisma.product.findFirst({ where: { id: productId, tenantId } }),
            prisma.vendor.findFirst({ where: { id: fromVendorId, tenantId } }),
        ]);

        if (!project) {
            return res.status(404).json({ message: 'Project not found' });
        }
        if (!product) {
            return res.status(400).json({ message: 'Product not found' });
        }
        if (!vendor) {
            return res.status(400).json({ message: 'Vendor not found' });
        }

        // Transaction: upsert project stock (by productId + unit) and create movement
        await prisma.$transaction(async (tx) => {
            // Upsert by (projectId, productId, unit)
            await tx.projectStock.upsert({
                where: {
                    projectId_productId_unit: { projectId, productId, unit },
                },
                update: {
                    quantityOnSite: { increment: quantity },
                },
                create: {
                    projectId,
                    productId,
                    unit,
                    quantityOnSite: quantity,
                },
            });

            await tx.stockMovement.create({
                data: {
                    tenantId,
                    productId,
                    type: 'STOCK_IN',
                    quantity,
                    unitPrice,
                    fromVendorId,
                    toProjectId: projectId,
                    referenceType: ReferenceType.PROJECT_ORDER,
                    date: new Date(),
                    notes,
                    createdBy: req.user.userId,
                },
            });
        });

        // Log activity
        await prisma.activityLog.create({
            data: {
                tenantId,
                userId: req.user.userId,
                action: 'ORDER',
                entityType: 'Project',
                entityId: projectId,
                details: { productId, quantity, unitPrice, fromVendorId, unit },
            },
        });

        const elapsed = Date.now() - startTime;
        console.log(`✅ Order completed in ${elapsed}ms for project ${projectId}`);

        res.status(201).json({
            message: 'Material ordered successfully',
            data: { productId, quantity, unit, unitPrice },
        });
    } catch (error: any) {
        console.error('❌ Order error:', error);
        res.status(500).json({
            message: 'Failed to create order',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined,
        });
    }
};

// ─── Consume material ────────────────────────────────────
export const consumeMaterial = async (req: any, res: any) => {
    const startTime = Date.now();
    try {
        const tenantId = req.user.tenantId;
        const projectId = parseInt(req.params.id);

        if (!tenantId || !projectId) {
            return res.status(400).json({ message: 'Invalid tenant or project ID' });
        }

        const validation = consumeSchema.safeParse(req.body);
        if (!validation.success) {
            return res.status(400).json({
                message: 'Validation error',
                errors: validation.error.issues.map((i) => ({
                    field: i.path.join('.'),
                    message: i.message,
                })),
            });
        }

        const { productId, quantity, unit, notes } = validation.data;

        const project = await prisma.project.findFirst({ where: { id: projectId, tenantId } });
        if (!project) {
            return res.status(404).json({ message: 'Project not found' });
        }

        // Lookup stock by (projectId, productId, unit)
        const projectStock = await prisma.projectStock.findUnique({
            where: {
                projectId_productId_unit: { projectId, productId, unit },
            },
        });

        if (!projectStock) {
            return res.status(400).json({
                message: `Product not found in project stock with unit "${unit}"`,
            });
        }

        if (projectStock.quantityOnSite < quantity) {
            return res.status(400).json({
                message: `Insufficient stock. Available: ${projectStock.quantityOnSite} ${unit}`,
            });
        }

        await prisma.$transaction(async (tx) => {
            await tx.projectStock.update({
                where: {
                    projectId_productId_unit: { projectId, productId, unit },
                },
                data: { quantityOnSite: { decrement: quantity } },
            });

            await tx.stockMovement.create({
                data: {
                    tenantId,
                    productId,
                    type: 'STOCK_OUT',
                    quantity,
                    toProjectId: projectId,
                    referenceType: ReferenceType.PROJECT_CONSUME,
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
                details: { productId, quantity, unit },
            },
        });

        const elapsed = Date.now() - startTime;
        console.log(`✅ Consumption recorded in ${elapsed}ms for project ${projectId}`);

        res.status(201).json({
            message: 'Consumption recorded',
            data: { productId, quantity, unit },
        });
    } catch (error: any) {
        console.error('❌ Consumption error:', error);
        res.status(500).json({
            message: 'Failed to record consumption',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined,
        });
    }
};

// ─── Transfer material back to office ────────────────────
export const transferOutMaterial = async (req: any, res: any) => {
    const startTime = Date.now();
    try {
        const tenantId = req.user.tenantId;
        const projectId = parseInt(req.params.id);

        if (!tenantId || !projectId) {
            return res.status(400).json({ message: 'Invalid tenant or project ID' });
        }

        const validation = transferOutSchema.safeParse(req.body);
        if (!validation.success) {
            return res.status(400).json({
                message: 'Validation error',
                errors: validation.error.issues.map((i) => ({
                    field: i.path.join('.'),
                    message: i.message,
                })),
            });
        }

        const { productId, quantity, unit, notes } = validation.data;

        const project = await prisma.project.findFirst({ where: { id: projectId, tenantId } });
        if (!project) {
            return res.status(404).json({ message: 'Project not found' });
        }

        const projectStock = await prisma.projectStock.findUnique({
            where: {
                projectId_productId_unit: { projectId, productId, unit },
            },
        });

        if (!projectStock) {
            return res.status(400).json({
                message: `Product not found in project stock with unit "${unit}"`,
            });
        }

        if (projectStock.quantityOnSite < quantity) {
            return res.status(400).json({
                message: `Insufficient stock. Available: ${projectStock.quantityOnSite} ${unit}`,
            });
        }

        await prisma.$transaction(async (tx) => {
            await tx.projectStock.update({
                where: {
                    projectId_productId_unit: { projectId, productId, unit },
                },
                data: { quantityOnSite: { decrement: quantity } },
            });

            await tx.stockMovement.create({
                data: {
                    tenantId,
                    productId,
                    type: 'STOCK_OUT',
                    quantity,
                    toProjectId: projectId,
                    referenceType: ReferenceType.PROJECT_RETURN,
                    date: new Date(),
                    notes: notes || 'Return to office',
                    createdBy: req.user.userId,
                },
            });
        });

        await prisma.activityLog.create({
            data: {
                tenantId,
                userId: req.user.userId,
                action: 'TRANSFER_OUT',
                entityType: 'Project',
                entityId: projectId,
                details: { productId, quantity, unit },
            },
        });

        const elapsed = Date.now() - startTime;
        console.log(`✅ Return recorded in ${elapsed}ms for project ${projectId}`);

        res.status(201).json({
            message: 'Return to office recorded',
            data: { productId, quantity, unit },
        });
    } catch (error: any) {
        console.error('❌ Transfer error:', error);
        res.status(500).json({
            message: 'Failed to transfer out',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined,
        });
    }
};



// ... other imports and helpers

export const getProjectMovements = async (req: any, res: any) => {
    const startTime = Date.now();
    try {
        const tenantId = req.user.tenantId;
        const projectId = parseInt(req.params.id);

        if (!tenantId || !projectId) {
            return res.status(400).json({ message: 'Invalid tenant or project ID' });
        }

        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 20;
        const skip = (page - 1) * limit;

        const where: Prisma.StockMovementWhereInput = {
            tenantId,
            toProjectId: projectId,
        };

        // Filter by type using ReferenceType enum
        if (req.query.type) {
            const typeMap: Record<string, ReferenceType[]> = {
                ORDER: [ReferenceType.PROJECT_ORDER],
                CONSUME: [ReferenceType.PROJECT_CONSUME],
                TRANSFER_OUT: [ReferenceType.PROJECT_RETURN],
            };
            const refTypes = typeMap[req.query.type as string];
            if (refTypes) {
                where.referenceType = { in: refTypes };
            }
        }

        const [movements, total] = await Promise.all([
            prisma.stockMovement.findMany({
                where,
                include: {
                    product: { select: { id: true, name: true, unit: true } },
                    fromVendor: { select: { id: true, name: true } },
                    user: { select: { id: true, name: true } },
                },
                orderBy: { date: 'desc' },
                skip,
                take: limit,
            }),
            prisma.stockMovement.count({ where }),
        ]);

        const result = movements.map((m) => {
            let displayType: string;
            if (m.referenceType === ReferenceType.PROJECT_ORDER) displayType = 'ORDER';
            else if (m.referenceType === ReferenceType.PROJECT_CONSUME) displayType = 'CONSUME';
            else if (m.referenceType === ReferenceType.PROJECT_RETURN) displayType = 'TRANSFER_OUT';
            else displayType = m.type;

            const brand = extractBrandFromNotes(m.notes);

            return {
                id: m.id,
                type: displayType,
                quantity: m.quantity,
                unitPrice: m.unitPrice,
                date: m.date,
                notes: m.notes,
                product: m.product,
                fromVendor: m.fromVendor,
                user: m.user,
                brand,
            };
        });

        const elapsed = Date.now() - startTime;
        console.log(`✅ Movements fetched in ${elapsed}ms for project ${projectId}`);

        res.json({
            data: result,
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit),
            },
        });
    } catch (error: any) {
        console.error('❌ Fetch movements error:', error);
        res.status(500).json({
            message: 'Failed to fetch movements',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined,
        });
    }
};

// ─── Get project stock ────────────────────────────────────
// ─── Update getProjectStock ─────────────────────────────
export const getProjectStock = async (req: any, res: any) => {
    const startTime = Date.now();
    try {
        const tenantId = req.user.tenantId;
        const projectId = parseInt(req.params.id);

        if (!tenantId || !projectId) {
            return res.status(400).json({ message: 'Invalid tenant or project ID' });
        }

        const stocks = await prisma.projectStock.findMany({
            where: { projectId, quantityOnSite: { gt: 0 } },
            include: {
                product: { select: { id: true, name: true, unit: true } },
            },
        });

        if (stocks.length === 0) {
            return res.json([]);
        }

        const productIds = stocks.map((s) => s.productId);
        const movements = await prisma.stockMovement.findMany({
            where: {
                tenantId,
                toProjectId: projectId,
                type: 'STOCK_IN',
                productId: { in: productIds },
            },
            select: {
                productId: true,
                notes: true,
                date: true,
            },
            orderBy: { date: 'desc' },
        });

        const latestMovementPerProduct: Record<number, { notes: string | null; date: Date }> = {};
        for (const m of movements) {
            if (!latestMovementPerProduct[m.productId]) {
                latestMovementPerProduct[m.productId] = { notes: m.notes, date: m.date };
            }
        }

        const result = stocks.map((s) => {
            const latest = latestMovementPerProduct[s.productId];
            let brand: string | null = null;
            let unit = s.unit;
            let modelNumber: string | null = null;

            if (latest && latest.notes) {
                brand = extractBrandFromNotes(latest.notes);
                const extractedUnit = extractUnitFromNotes(latest.notes);
                if (extractedUnit) {
                    unit = extractedUnit;
                }
                modelNumber = extractModelFromNotes(latest.notes); // 👈 new
            }

            return {
                productId: s.productId,
                name: s.product.name,
                unit,
                quantityOnSite: s.quantityOnSite,
                brand,
                modelNumber,
            };
        });

        const elapsed = Date.now() - startTime;
        console.log(`✅ Project stock fetched in ${elapsed}ms for project ${projectId}`);

        res.json(result);
    } catch (error: any) {
        console.error('❌ Fetch stock error:', error);
        res.status(500).json({
            message: 'Failed to fetch project stock',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined,
        });
    }
};





export const getProjectStats = async (req: any, res: any) => {
    try {
        const tenantId = req.user.tenantId;
        const projectId = Number(req.params.id);

        // Verify project exists and belongs to tenant
        const project = await prisma.project.findFirst({
            where: { id: projectId, tenantId },
        });
        if (!project) {
            return res.status(404).json({ message: 'Project not found' });
        }

        // Fetch all movements for this project
        const movements = await prisma.stockMovement.findMany({
            where: {
                tenantId,
                toProjectId: projectId,
            },
            include: {
                product: true,
            },
        });

        // Fetch project stock (current on-site quantities)
        const projectStock = await prisma.projectStock.findMany({
            where: { projectId },
            include: {
                product: true,
            },
        });

        // Build product map using project stock as baseline
        const productMap: Record<number, ProductStat> = {};
        projectStock.forEach((ps) => {
            productMap[ps.productId] = {
                product: {
                    id: ps.productId,
                    name: ps.product.name,
                    unit: ps.unit,
                },
                ordered: 0,
                consumed: 0,
                returned: 0,
                remaining: ps.quantityOnSite,
                orderedValue: 0,
                brand: null, // Adjust if you have a brand field elsewhere
            };
        });

        // Process movements
        movements.forEach((m) => {
            const pid = m.productId;
            // Ensure entry exists (fallback if product not in projectStock)
            if (!productMap[pid]) {
                productMap[pid] = {
                    product: {
                        id: pid,
                        name: m.product.name,
                        unit: m.product.unit,
                    },
                    ordered: 0,
                    consumed: 0,
                    returned: 0,
                    remaining: 0,
                    orderedValue: 0,
                    brand: null,
                };
            }

            const entry = productMap[pid];

            if (m.type === 'STOCK_IN') {
                // Order (incoming to project)
                entry.ordered += m.quantity;
                entry.orderedValue += m.quantity * (Number(m.unitPrice) || 0);
            } else if (m.type === 'STOCK_OUT') {
                // Distinguish between CONSUME and RETURN based on referenceType
                if (m.referenceType === 'PROJECT_CONSUME') {
                    entry.consumed += m.quantity;
                } else if (m.referenceType === 'PROJECT_RETURN') {
                    entry.returned += m.quantity;
                } else {
                    // Other reference types (e.g., OFFICE_ISSUE) – treat as consumed (or ignore)
                    // You can decide based on your business logic
                    entry.consumed += m.quantity;
                }
            }
        });

        // Compute totals
        const products = Object.values(productMap);
        const totals = {
            totalOrdered: products.reduce((sum, p) => sum + p.ordered, 0),
            totalConsumed: products.reduce((sum, p) => sum + p.consumed, 0),
            totalReturned: products.reduce((sum, p) => sum + p.returned, 0),
            totalRemaining: products.reduce((sum, p) => sum + p.remaining, 0),
            totalProducts: products.length,
            totalOrderedValue: products.reduce((sum, p) => sum + p.orderedValue, 0),
            consumptionRate: 0,
            lastActivity: movements.length
                ? movements[0].date.toISOString()
                : null,
        };
        totals.consumptionRate =
            totals.totalOrdered > 0
                ? Math.round((totals.totalConsumed / totals.totalOrdered) * 100)
                : 0;

        res.json({ products, totals });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Failed to fetch project stats' });
    }
};