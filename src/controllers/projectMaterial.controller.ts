// backend/src/controllers/projectMaterial.controller.ts
import prisma from '../lib/prisma';
import { z } from 'zod';

// ─── Validation schemas ────────────────────────────────────────
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

// ─── Order material for a project ─────────────────────────────
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

        // Verify project exists and belongs to tenant
        const project = await prisma.project.findFirst({ where: { id: projectId, tenantId } });
        if (!project) return res.status(404).json({ message: 'Project not found' });

        // Verify product
        const product = await prisma.product.findFirst({ where: { id: productId, tenantId } });
        if (!product) return res.status(400).json({ message: 'Product not found' });

        // Verify vendor
        const vendor = await prisma.vendor.findFirst({ where: { id: fromVendorId, tenantId } });
        if (!vendor) return res.status(400).json({ message: 'Vendor not found' });

        // Get primary brand of product (or use first brand)
        const productBrand = await prisma.productBrand.findFirst({ where: { productId } });

        const movement = await prisma.projectMaterialMovement.create({
            data: {
                tenantId,
                projectId,
                productId,
                type: 'ORDER',
                quantity,
                unitPrice,
                fromVendorId,
                brandId: productBrand?.brandId ?? null,
                notes,
                date: new Date(),
                createdBy: req.user.userId,
            },
        });

        res.status(201).json(movement);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Failed to create order' });
    }
};

// ─── Consume material (from project stock) ────────────────────
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

        const product = await prisma.product.findFirst({ where: { id: productId, tenantId } });
        if (!product) return res.status(400).json({ message: 'Product not found' });

        // Optionally check if project has enough ordered materials (could compute balance)
        const productBrand = await prisma.productBrand.findFirst({ where: { productId } });

        const movement = await prisma.projectMaterialMovement.create({
            data: {
                tenantId,
                projectId,
                productId,
                type: 'CONSUME',
                quantity,
                brandId: productBrand?.brandId ?? null,
                notes,
                date: new Date(),
                createdBy: req.user.userId,
            },
        });

        res.status(201).json(movement);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Failed to record consumption' });
    }
};

// ─── Transfer material back to office ─────────────────────────
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

        const product = await prisma.product.findFirst({ where: { id: productId, tenantId } });
        if (!product) return res.status(400).json({ message: 'Product not found' });

        const productBrand = await prisma.productBrand.findFirst({ where: { productId } });

        const movement = await prisma.projectMaterialMovement.create({
            data: {
                tenantId,
                projectId,
                productId,
                type: 'TRANSFER_OUT',
                quantity,
                brandId: productBrand?.brandId ?? null,
                notes,
                date: new Date(),
                createdBy: req.user.userId,
            },
        });

        // (Optional) also create a StockTransfer record in the main system
        res.status(201).json(movement);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Failed to create transfer' });
    }
};

// ─── Get project material movements (for the Movements tab) ────
export const getProjectMovements = async (req: any, res: any) => {
    try {
        const tenantId = req.user.tenantId;
        const projectId = parseInt(req.params.id);

        const movements = await prisma.projectMaterialMovement.findMany({
            where: { tenantId, projectId },
            include: {
                product: { select: { id: true, name: true, unit: true } },
                fromVendor: { select: { id: true, name: true } },
                brand: { select: { id: true, name: true } },
                user: { select: { id: true, name: true } },
            },
            orderBy: { date: 'desc' },
            take: 50,
        });

        res.json(movements);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Failed to fetch movements' });
    }
};