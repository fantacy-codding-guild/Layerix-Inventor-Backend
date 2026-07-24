import prisma from '../lib/prisma';
import { z } from 'zod';
import { ReferenceType } from '@prisma/client';   // ✅ import for enum

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

// ─── Validation schemas ──────────────────────────────────
const orderSchema = z.object({
    productId: z.number().int(),
    quantity: z.number().int().positive(),
    unitPrice: z.number().positive(),
    fromVendorId: z.number().int().positive(),
    unit: z.string().optional(),
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

// ─── Order material for a project (add to project stock) ──
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

        const { productId, quantity, unitPrice, fromVendorId, unit, notes } = validation.data;

        const project = await prisma.project.findFirst({ where: { id: projectId, tenantId } });
        if (!project) return res.status(404).json({ message: 'Project not found' });

        const product = await prisma.product.findFirst({ where: { id: productId, tenantId } });
        if (!product) return res.status(400).json({ message: 'Product not found' });

        const vendor = await prisma.vendor.findFirst({ where: { id: fromVendorId, tenantId } });
        if (!vendor) return res.status(400).json({ message: 'Vendor not found' });

        const itemUnit = unit || product.unit;

        await prisma.$transaction(async (tx) => {
            await tx.projectStock.upsert({
                where: { projectId_productId: { projectId, productId } },
                update: { quantityOnSite: { increment: quantity } },
                create: { projectId, productId, quantityOnSite: quantity },
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
                    referenceType: ReferenceType.PROJECT_ORDER,   // ✅ updated
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

// ─── Consume material (decrease project stock) ────────────
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

        const projectStock = await prisma.projectStock.findUnique({
            where: { projectId_productId: { projectId, productId } },
        });

        if (!projectStock || projectStock.quantityOnSite < quantity) {
            return res.status(400).json({ message: 'Insufficient stock at project site' });
        }

        await prisma.$transaction(async (tx) => {
            await tx.projectStock.update({
                where: { projectId_productId: { projectId, productId } },
                data: { quantityOnSite: { decrement: quantity } },
            });

            await tx.stockMovement.create({
                data: {
                    tenantId,
                    productId,
                    type: 'STOCK_OUT',
                    quantity,
                    toProjectId: projectId,
                    referenceType: ReferenceType.PROJECT_CONSUME,   // ✅ updated
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

// ─── Transfer material back to office ─────────────────────
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

        const projectStock = await prisma.projectStock.findUnique({
            where: { projectId_productId: { projectId, productId } },
        });

        if (!projectStock || projectStock.quantityOnSite < quantity) {
            return res.status(400).json({ message: 'Insufficient stock at project site' });
        }

        await prisma.$transaction(async (tx) => {
            await tx.projectStock.update({
                where: { projectId_productId: { projectId, productId } },
                data: { quantityOnSite: { decrement: quantity } },
            });

            await tx.stockMovement.create({
                data: {
                    tenantId,
                    productId,
                    type: 'STOCK_OUT',
                    quantity,
                    toProjectId: null,   // office
                    referenceType: ReferenceType.PROJECT_RETURN,   // ✅ updated
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

// ─── Get project material movements (from StockMovement) ──
export const getProjectMovements = async (req: any, res: any) => {
    try {
        const tenantId = req.user.tenantId;
        const projectId = parseInt(req.params.id);

        const movements = await prisma.stockMovement.findMany({
            where: { tenantId, toProjectId: projectId },
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
            brand: extractBrandFromNotes(m.notes) || null,
        }));

        res.json(result);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Failed to fetch movements' });
    }
};

// ─── Get project stock (for consume/return dropdowns) ─────
export const getProjectStock = async (req: any, res: any) => {
    try {
        const tenantId = req.user.tenantId;
        const projectId = parseInt(req.params.id);

        const stocks = await prisma.projectStock.findMany({
            where: { projectId, quantityOnSite: { gt: 0 } },
            include: {
                product: { select: { id: true, name: true, unit: true } },
            },
        });

        const result = stocks.map(s => ({
            productId: s.productId,
            name: s.product.name,
            unit: s.product.unit,
            quantityOnSite: s.quantityOnSite,
            brand: null as string | null,
        }));

        for (const item of result) {
            const movement = await prisma.stockMovement.findFirst({
                where: { toProjectId: projectId, productId: item.productId, type: 'STOCK_IN' },
                orderBy: { date: 'desc' },
                select: { notes: true },
            });
            if (movement) {
                item.brand = extractBrandFromNotes(movement.notes);
                const orderUnit = extractUnitFromNotes(movement.notes);
                if (orderUnit) {
                    item.unit = orderUnit;
                }
            }
        }

        res.json(result);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Failed to fetch project stock' });
    }
};