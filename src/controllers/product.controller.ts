import prisma from '../lib/prisma';
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
                // no stock include – stock is now separate inventoryItems
                orderBy: { [sortBy as string]: sortOrder },
                skip,
                take: Number(limit),
            }),
            prisma.product.count({ where }),
        ]);

        // Return product data only – stock/quantity is now in inventoryItems
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
            // No includes – only the product's own fields (name, unit, description, etc.)
        });

        if (!product) return res.status(404).json({ message: 'Product not found' });

        // Return exactly what the frontend expects for editing
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
        const data = validation.data;
        const productCode = await generateProductCode(tenantId);

        // No stock creation – stock is now separate inventoryItems
        const product = await prisma.product.create({
            data: {
                tenantId,
                productCode,
                name: data.name,
                unit: data.unit,
                description: data.description || null,
                modelNumber: data.modelNumber,
                // No brands array – brands are part of inventoryItems
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
        console.error(error);
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

        // Only fields that exist on Product
        const updateData: any = {
            name: data.name,
            unit: data.unit,
            description: data.description,
            modelNumber: data.modelNumber,
        };

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

        // Check if product has any inventory items or stock movements
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