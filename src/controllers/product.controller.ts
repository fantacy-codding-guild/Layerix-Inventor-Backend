// backend/src/controllers/product.controller.ts
import prisma from '../lib/prisma';
import { Prisma } from '@prisma/client';   // ✅ import Prisma for error handling
import {
    createProductSchema,
    updateProductSchema,
} from '../validators/product.validator';

const generateProductCode = async (tenantId: number) => {
    const today = new Date();
    const datePart = today.toISOString().slice(0, 10).replace(/-/g, '');
    const countToday = await prisma.product.count({
        where: {
            tenantId,
            createdAt: {
                gte: new Date(today.getFullYear(), today.getMonth(), today.getDate()),
                lt: new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1),
            },
        },
    });
    return `PRD-${datePart}-${String(countToday + 1).padStart(3, '0')}`;
};

export const getProducts = async (req: any, res: any) => {
    try {
        const tenantId = req.user.tenantId;
        const { search, page = 1, limit = 20, sortBy = 'createdAt', sortOrder = 'desc' } = req.query;
        const skip = (Number(page) - 1) * Number(limit);

        let where: any = { tenantId };
        if (search) {
            where.OR = [
                { name: { contains: search, mode: 'insensitive' } },
                { productCode: { contains: search, mode: 'insensitive' } },
            ];
        }

        const [products, total] = await Promise.all([
            prisma.product.findMany({
                where,
                orderBy: { [sortBy as string]: sortOrder },
                skip,
                take: Number(limit),
            }),
            prisma.product.count({ where }),
        ]);

        res.json({
            data: products,
            pagination: {
                page: Number(page),
                limit: Number(limit),
                total,
                totalPages: Math.ceil(total / Number(limit)),
            },
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Failed to fetch products' });
    }
};

export const getProduct = async (req: any, res: any) => {
    try {
        const product = await prisma.product.findFirst({
            where: { id: parseInt(req.params.id), tenantId: req.user.tenantId },
        });

        if (!product) return res.status(404).json({ message: 'Product not found' });
        res.json(product);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Failed to fetch product' });
    }
};

export const createProduct = async (req: any, res: any) => {
    try {
        const tenantId = req.user.tenantId;
        const validation = createProductSchema.safeParse(req.body);
        if (!validation.success) {
            return res.status(400).json({
                message: 'Validation error',
                errors: validation.error.issues.map(issue => ({
                    field: issue.path.join('.'),
                    message: issue.message,
                })),
            });
        }

        // Extract and trim data
        let { name, unit, description, modelNumber } = validation.data;
        name = name?.trim();
        unit = unit?.trim() || 'Pcs';
        description = description?.trim() || null;
        modelNumber = modelNumber?.trim() || null;

        if (!name) {
            return res.status(400).json({
                message: 'Product name is required and cannot be empty.',
            });
        }

        // Check for duplicate product name (case‑insensitive)
        const existingProduct = await prisma.product.findFirst({
            where: {
                tenantId,
                name: { equals: name, mode: 'insensitive' },
            },
        });
        if (existingProduct) {
            return res.status(409).json({
                message: `A product with the name "${name}" already exists. Please use a different name.`,
            });
        }

        const productCode = await generateProductCode(tenantId);

        const product = await prisma.product.create({
            data: {
                tenantId,
                productCode,
                name,
                unit,
                description,
                modelNumber,
            },
        });

        await prisma.activityLog.create({
            data: {
                tenantId,
                userId: req.user.userId,
                action: 'CREATE',
                entityType: 'Product',
                entityId: product.id,
                details: { name: product.name },
            },
        });

        res.status(201).json(product);
    } catch (error) {
        console.error('Create product error:', error);

        // Handle Prisma unique constraint error
        if (error instanceof Prisma.PrismaClientKnownRequestError) {
            if (error.code === 'P2002') {
                return res.status(409).json({
                    message: 'A product with this name or code already exists.',
                });
            }
        }

        res.status(500).json({ message: 'Failed to create product' });
    }
};

export const updateProduct = async (req: any, res: any) => {
    try {
        const tenantId = req.user.tenantId;
        const productId = parseInt(req.params.id);

        const validation = updateProductSchema.safeParse(req.body);
        if (!validation.success) {
            return res.status(400).json({
                message: 'Validation error',
                errors: validation.error.issues.map(issue => ({
                    field: issue.path.join('.'),
                    message: issue.message,
                })),
            });
        }
        const data = validation.data;

        const existing = await prisma.product.findFirst({ where: { id: productId, tenantId } });
        if (!existing) return res.status(404).json({ message: 'Product not found' });

        // Trim and prepare update data
        const updateData: any = {};
        if (data.name !== undefined) updateData.name = data.name?.trim();
        if (data.unit !== undefined) updateData.unit = data.unit?.trim() || 'Pcs';
        if (data.description !== undefined) updateData.description = data.description?.trim() || null;
        if (data.modelNumber !== undefined) updateData.modelNumber = data.modelNumber?.trim() || null;

        const updated = await prisma.product.update({
            where: { id: productId },
            data: updateData,
        });

        await prisma.activityLog.create({
            data: {
                tenantId,
                userId: req.user.userId,
                action: 'UPDATE',
                entityType: 'Product',
                entityId: productId,
                details: { changes: data },
            },
        });

        res.json(updated);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Failed to update product' });
    }
};

export const deleteProduct = async (req: any, res: any) => {
    try {
        const tenantId = req.user.tenantId;
        const productId = parseInt(req.params.id);
        const existing = await prisma.product.findFirst({ where: { id: productId, tenantId } });
        if (!existing) return res.status(404).json({ message: 'Product not found' });

        const itemCount = await prisma.inventoryItem.count({ where: { productId } });
        const movementCount = await prisma.stockMovement.count({ where: { productId } });
        if (itemCount > 0 || movementCount > 0) {
            return res.status(409).json({
                message: 'Cannot delete product with existing stock. Consider archiving instead.',
            });
        }

        await prisma.product.delete({ where: { id: productId } });

        await prisma.activityLog.create({
            data: {
                tenantId,
                userId: req.user.userId,
                action: 'DELETE',
                entityType: 'Product',
                entityId: productId,
                details: { name: existing.name },
            },
        });

        res.json({ message: 'Product deleted successfully' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Failed to delete product' });
    }
};