import prisma from '../lib/prisma';
import { createProductSchema, updateProductSchema } from '../validators/product.validator';

// Generate product code: PRD-YYYYMMDD-NNN
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

// GET /api/products
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
                    brands: {
                        include: { brand: { select: { id: true, name: true } } }
                    },
                    stock: true,
                },
                orderBy: { [sortBy as string]: sortOrder },
                skip,
                take: Number(limit),
            }),
            prisma.product.count({ where }),
        ]);

        const data = products.map(p => ({
            ...p,
            brands: p.brands.map(pb => pb.brand)
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

// GET /api/products/:id
export const getProduct = async (req: any, res: any) => {
    try {
        const product = await prisma.product.findFirst({
            where: {
                id: parseInt(req.params.id),
                tenantId: req.user.tenantId,
            },
            include: {
                brands: {
                    include: { brand: { select: { id: true, name: true } } }
                },
                stock: true,
            },
        });

        if (!product) return res.status(404).json({ message: 'Product not found' });

        const result = {
            ...product,
            brands: product.brands.map(pb => pb.brand),
            availableStock: (product.stock?.quantityOnHand ?? 0) - (product.stock?.reservedQuantity ?? 0),
            isLowStock: ((product.stock?.quantityOnHand ?? 0) - (product.stock?.reservedQuantity ?? 0)) < (product.minStockLevel ?? 0),
        };

        res.json(result);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Failed to fetch product' });
    }
};

// POST /api/products
export const createProduct = async (req: any, res: any) => {
    try {
        const tenantId = req.user.tenantId;
        const validation = createProductSchema.safeParse(req.body);
        if (!validation.success) {
            return res.status(400).json({
                message: 'Validation error',
                errors: validation.error.issues.map((issue) => ({
                    field: issue.path.join('.'),
                    message: issue.message,
                })),
            });
        }

        const data = validation.data;
        const brandIds = data.brandIds || [];

        if (brandIds.length) {
            const brands = await prisma.brand.findMany({
                where: { id: { in: brandIds }, tenantId },
                select: { id: true },
            });
            if (brands.length !== brandIds.length) {
                return res.status(400).json({ message: 'One or more brands not found' });
            }
        }

        const productCode = await generateProductCode(tenantId);

        const product = await prisma.product.create({
            data: {
                tenantId,
                productCode,
                name: data.name,
                modelNumber: data.modelNumber || null,
                unit: data.unit || 'Pcs',
                description: data.description || null,
                stock: {
                    create: {
                        quantityOnHand: 0,
                        reservedQuantity: 0,
                    },
                },
                brands: {
                    create: brandIds.map(brandId => ({ brandId })),
                },
            },
            include: {
                brands: { include: { brand: true } },
                stock: true,
            },
        });

        // Log activity
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

        res.status(201).json({
            ...product,
            brands: product.brands.map(pb => pb.brand),
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Failed to create product' });
    }
};

// PUT /api/products/:id
export const updateProduct = async (req: any, res: any) => {
    try {
        const tenantId = req.user.tenantId;
        const productId = parseInt(req.params.id);
        const validation = updateProductSchema.safeParse(req.body);
        if (!validation.success) {
            return res.status(400).json({
                message: 'Validation error',
                errors: validation.error.issues.map((issue) => ({
                    field: issue.path.join('.'),
                    message: issue.message,
                })),
            });
        }
        const data = validation.data;

        const existing = await prisma.product.findFirst({ where: { id: productId, tenantId } });
        if (!existing) return res.status(404).json({ message: 'Product not found' });

        const brandIds = data.brandIds || [];

        if (brandIds.length) {
            const brands = await prisma.brand.findMany({
                where: { id: { in: brandIds }, tenantId },
                select: { id: true },
            });
            if (brands.length !== brandIds.length) {
                return res.status(400).json({ message: 'One or more brands not found' });
            }
        }

        await prisma.$transaction(async (tx) => {
            await tx.product.update({
                where: { id: productId },
                data: {
                    name: data.name,
                    modelNumber: data.modelNumber,
                    unit: data.unit,
                    description: data.description,
                },
            });

            await tx.productBrand.deleteMany({ where: { productId } });
            if (brandIds.length) {
                await tx.productBrand.createMany({
                    data: brandIds.map(brandId => ({ productId, brandId })),
                });
            }
        });

        const updated = await prisma.product.findFirst({
            where: { id: productId, tenantId },
            include: {
                brands: { include: { brand: true } },
                stock: true,
            },
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

        res.json({
            ...updated,
            brands: updated!.brands.map(pb => pb.brand),
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Failed to update product' });
    }
};

// DELETE /api/products/:id
export const deleteProduct = async (req: any, res: any) => {
    try {
        const tenantId = req.user.tenantId;
        const productId = parseInt(req.params.id);

        const existing = await prisma.product.findFirst({ where: { id: productId, tenantId } });
        if (!existing) return res.status(404).json({ message: 'Product not found' });

        const usedInStock = await prisma.stockMovement.count({ where: { productId } });
        if (usedInStock > 0) {
            return res.status(409).json({ message: 'Cannot delete product with existing stock movements. Consider archiving instead.' });
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