// backend/src/controllers/product.controller.ts
import prisma from '../lib/prisma';
import {
    createProductSchema,
    updateProductSchema,
} from '../validators/product.validator';   // ✅ imported validators with unit

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

// ────────── READ ──────────
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
                { sku: { contains: search, mode: 'insensitive' } },
            ];
        }

        const [products, total] = await Promise.all([
            prisma.product.findMany({
                where,
                include: {
                    stock: true,
                    brands: { include: { brand: { select: { id: true, name: true } } } },
                },
                orderBy: { [sortBy as string]: sortOrder },
                skip,
                take: Number(limit),
            }),
            prisma.product.count({ where }),
        ]);

        const data = products.map(p => ({
            ...p,
            brands: p.brands.map(pb => pb.brand),
        }));

        res.json({
            data,
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
            // no includes – only the basic fields (id, name, unit, description, etc.)
        });

        if (!product) return res.status(404).json({ message: 'Product not found' });

        res.json(product);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Failed to fetch product' });
    }
};

// ────────── CREATE ──────────
export const createProduct = async (req: any, res: any) => {
    try {
        const tenantId = req.user.tenantId;
        // ✅ Use external validator – it accepts unit, modelNumber, etc.
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

        const product = await prisma.product.create({
            data: {
                tenantId,
                productCode,
                name: data.name,
                unit: data.unit,                 // ✅ unit saved
                description: data.description || null,
                modelNumber: data.modelNumber,   // if your schema has it
                stock: {
                    create: { quantityOnHand: 0, reservedQuantity: 0 },
                },
            },
            include: { stock: true },
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

// ────────── UPDATE ──────────
export const updateProduct = async (req: any, res: any) => {
    try {
        const tenantId = req.user.tenantId;
        const productId = parseInt(req.params.id);

        // ✅ Use external (partial) validator – allows updating unit
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

        // ✅ Spread all allowed fields – unit will be updated if provided
        const updated = await prisma.product.update({
            where: { id: productId },
            data: {
                ...data,   // includes name, unit, description, modelNumber (if sent)
            },
            include: { stock: true },
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

// ────────── DELETE ──────────
export const deleteProduct = async (req: any, res: any) => {
    try {
        const tenantId = req.user.tenantId;
        const productId = parseInt(req.params.id);
        const existing = await prisma.product.findFirst({ where: { id: productId, tenantId } });
        if (!existing) return res.status(404).json({ message: 'Product not found' });

        const usedInStock = await prisma.stockMovement.count({ where: { productId } });
        if (usedInStock > 0) {
            return res.status(409).json({
                message: 'Cannot delete product with existing stock movements. Consider archiving instead.',
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