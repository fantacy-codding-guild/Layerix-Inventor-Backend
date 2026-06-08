import prisma from '../lib/prisma';
import { vendorSchema, vendorProductMappingSchema } from '../validators/vendor.validator';
import { z } from 'zod';

// ---------- Helper: generate product code ----------
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

// ---------- Vendor CRUD ----------

export const getVendors = async (req: any, res: any) => {
    try {
        const tenantId = req.user.tenantId;
        const { search, page = 1, limit = 20, sortBy = 'name', sortOrder = 'asc' } = req.query;
        const skip = (Number(page) - 1) * Number(limit);
        const where: any = { tenantId };
        if (search) {
            where.OR = [
                { name: { contains: search, mode: 'insensitive' } },
                { companyName: { contains: search, mode: 'insensitive' } },
            ];
        }

        const [vendors, total] = await Promise.all([
            prisma.vendor.findMany({
                where,
                include: {
                    vendorProducts: {
                        include: {
                            product: {
                                select: {
                                    id: true,
                                    name: true,
                                    productCode: true,
                                    brand: { select: { name: true } },
                                    modelNumber: true,
                                },
                            },
                        },
                    },
                },
                orderBy: { [sortBy as string]: sortOrder },
                skip,
                take: Number(limit),
            }),
            prisma.vendor.count({ where }),
        ]);

        res.json({
            data: vendors,
            pagination: { page: Number(page), limit: Number(limit), total, totalPages: Math.ceil(total / Number(limit)) },
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Failed to fetch vendors' });
    }
};

export const getVendor = async (req: any, res: any) => {
    try {
        const vendor = await prisma.vendor.findFirst({
            where: { id: parseInt(req.params.id), tenantId: req.user.tenantId },
            include: {
                vendorProducts: {
                    include: {
                        product: {
                            select: {
                                id: true,
                                name: true,
                                productCode: true,
                                brand: { select: { name: true } },
                                modelNumber: true,
                            },
                        },
                    },
                },
            },
        });
        if (!vendor) return res.status(404).json({ message: 'Vendor not found' });
        res.json(vendor);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Failed to fetch vendor' });
    }
};

export const createVendor = async (req: any, res: any) => {
    try {
        const tenantId = req.user.tenantId;
        const validation = vendorSchema.safeParse(req.body);
        if (!validation.success) {
            return res.status(400).json({ message: 'Validation error', errors: validation.error.issues });
        }
        const vendor = await prisma.vendor.create({
            data: { ...validation.data, tenantId },
        });
        res.status(201).json(vendor);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Failed to create vendor' });
    }
};

export const updateVendor = async (req: any, res: any) => {
    try {
        const tenantId = req.user.tenantId;
        const id = parseInt(req.params.id);
        const exists = await prisma.vendor.findFirst({ where: { id, tenantId } });
        if (!exists) return res.status(404).json({ message: 'Vendor not found' });

        const validation = vendorSchema.safeParse(req.body);
        if (!validation.success) {
            return res.status(400).json({ message: 'Validation error', errors: validation.error.issues });
        }

        const updated = await prisma.vendor.update({
            where: { id },
            data: validation.data,
        });
        res.json(updated);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Failed to update vendor' });
    }
};

export const deleteVendor = async (req: any, res: any) => {
    try {
        const tenantId = req.user.tenantId;
        const id = parseInt(req.params.id);
        const vendor = await prisma.vendor.findFirst({ where: { id, tenantId } });
        if (!vendor) return res.status(404).json({ message: 'Vendor not found' });

        const poCount = await prisma.purchaseOrder.count({ where: { vendorId: id } });
        if (poCount > 0) {
            return res.status(409).json({ message: 'Cannot delete vendor with existing purchase orders.' });
        }

        await prisma.vendor.delete({ where: { id } });
        res.json({ message: 'Vendor deleted' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Failed to delete vendor' });
    }
};

// ---------- Vendor‑Product Mappings ----------

export const getVendorProducts = async (req: any, res: any) => {
    try {
        const vendorId = parseInt(req.params.id);
        const tenantId = req.user.tenantId;
        const mappings = await prisma.vendorProduct.findMany({
            where: { vendorId, vendor: { tenantId } },
            include: { product: { select: { id: true, name: true, productCode: true, brand: { select: { name: true } }, modelNumber: true } } },
        });
        res.json(mappings);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Failed to fetch vendor products' });
    }
};

export const addVendorProduct = async (req: any, res: any) => {
    try {
        const vendorId = parseInt(req.params.id);
        const tenantId = req.user.tenantId;

        // Verify vendor belongs to tenant
        const vendor = await prisma.vendor.findFirst({ where: { id: vendorId, tenantId } });
        if (!vendor) return res.status(404).json({ message: 'Vendor not found' });

        const validation = vendorProductMappingSchema.safeParse(req.body);
        if (!validation.success) {
            return res.status(400).json({ message: 'Validation error', errors: validation.error.issues });
        }

        const data = validation.data;
        let productId: number | undefined = data.productId;

        // If no productId, create the product first
        if (!productId) {
            if (!data.name) {
                return res.status(400).json({ message: 'Product name is required when creating a new product' });
            }

            // Handle brand
            let brandId: number | null = data.brandId ?? null;
            if (!brandId && data.newBrandName) {
                // Create brand if it doesn't exist
                let brand = await prisma.brand.findFirst({
                    where: { tenantId, name: { equals: data.newBrandName, mode: 'insensitive' } },
                });
                if (!brand) {
                    brand = await prisma.brand.create({ data: { tenantId, name: data.newBrandName } });
                }
                brandId = brand.id;
            }

            const productCode = await generateProductCode(tenantId);

            const product = await prisma.product.create({
                data: {
                    tenantId,
                    productCode,
                    name: data.name!,
                    brandId,
                    modelNumber: data.modelNumber,
                    unit: data.unit || 'Pcs',
                    description: data.description,
                    stock: { create: { quantityOnHand: 0, reservedQuantity: 0 } },
                },
            });
            productId = product.id;
        } else {
            // Verify product belongs to tenant
            const product = await prisma.product.findFirst({ where: { id: productId, tenantId } });
            if (!product) return res.status(400).json({ message: 'Product not found or not accessible' });
        }

        // Check if mapping already exists
        const existing = await prisma.vendorProduct.findUnique({
            where: { vendorId_productId: { vendorId, productId } },
        });
        if (existing) return res.status(409).json({ message: 'This product is already linked to this vendor' });

        const mapping = await prisma.vendorProduct.create({
            data: {
                vendorId,
                productId,
                unitPrice: data.unitPrice,
                leadTimeDays: data.leadTimeDays,
                isPreferred: data.isPreferred,
            },
            include: {
                product: {
                    select: {
                        id: true,
                        name: true,
                        productCode: true,
                        brand: { select: { name: true } },
                        modelNumber: true,
                    },
                },
            },
        });

        res.status(201).json(mapping);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Failed to add vendor product' });
    }
};

export const updateVendorProduct = async (req: any, res: any) => {
    try {
        const vendorId = parseInt(req.params.id);
        const productId = parseInt(req.params.productId);
        const tenantId = req.user.tenantId;

        const mapping = await prisma.vendorProduct.findUnique({
            where: { vendorId_productId: { vendorId, productId } },
            include: { vendor: true, product: true },
        });
        if (!mapping || mapping.vendor.tenantId !== tenantId) {
            return res.status(404).json({ message: 'Mapping not found' });
        }

        const validation = vendorProductMappingSchema.partial().safeParse(req.body);
        if (!validation.success) {
            return res.status(400).json({ message: 'Validation error', errors: validation.error.issues });
        }

        const updated = await prisma.vendorProduct.update({
            where: { vendorId_productId: { vendorId, productId } },
            data: validation.data,
            include: {
                product: {
                    select: { id: true, name: true, productCode: true, brand: { select: { name: true } }, modelNumber: true },
                },
            },
        });

        res.json(updated);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Failed to update vendor product' });
    }
};

export const removeVendorProduct = async (req: any, res: any) => {
    try {
        const vendorId = parseInt(req.params.id);
        const productId = parseInt(req.params.productId);
        const tenantId = req.user.tenantId;

        const mapping = await prisma.vendorProduct.findUnique({
            where: { vendorId_productId: { vendorId, productId } },
            include: { vendor: true },
        });
        if (!mapping || mapping.vendor.tenantId !== tenantId) {
            return res.status(404).json({ message: 'Mapping not found' });
        }

        await prisma.vendorProduct.delete({ where: { vendorId_productId: { vendorId, productId } } });
        res.json({ message: 'Product removed from vendor' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Failed to remove vendor product' });
    }
};

export const getVendorDetail = async (req: any, res: any) => {
    try {
        const tenantId = req.user.tenantId;
        const vendorId = parseInt(req.params.id);

        const vendor = await prisma.vendor.findFirst({
            where: { id: vendorId, tenantId },
            include: {
                vendorProducts: {
                    include: {
                        product: {
                            select: {
                                id: true,
                                name: true,
                                productCode: true,
                                brand: { select: { name: true } },
                                modelNumber: true,
                                unit: true,
                                stock: { select: { quantityOnHand: true, averageCost: true } },
                            },
                        },
                    },
                },
            },
        });

        if (!vendor) return res.status(404).json({ message: 'Vendor not found' });

        const productIds = vendor.vendorProducts.map(vp => vp.product.id);

        const stockMovements = await prisma.stockMovement.findMany({
            where: {
                productId: { in: productIds },
                type: 'STOCK_IN',
                fromVendorId: vendorId,
                tenantId,
            },
            orderBy: { date: 'desc' },
            include: {
                product: { select: { id: true, name: true, productCode: true } },
                user: { select: { id: true, name: true } },
            },
        });

        const productPrices: Record<number, any[]> = {};
        stockMovements.forEach(m => {
            if (!productPrices[m.productId]) productPrices[m.productId] = [];
            productPrices[m.productId].push({
                id: m.id,
                date: m.date,
                quantity: m.quantity,
                unitPrice: m.unitPrice,
                notes: m.notes,
                user: m.user?.name,
            });
        });

        const productsWithHistory = vendor.vendorProducts.map(vp => ({
            ...vp.product,
            unitPrice: vp.unitPrice,
            leadTimeDays: vp.leadTimeDays,
            isPreferred: vp.isPreferred,
            priceHistory: productPrices[vp.product.id] || [],
        }));

        res.json({
            vendor: {
                id: vendor.id,
                name: vendor.name,
                companyName: vendor.companyName,
                phone: vendor.phone,
                alternatePhone: vendor.alternatePhone,
                email: vendor.email,
                city: vendor.city,
                address: vendor.address,
                state: vendor.state,
                country: vendor.country,
                gstNumber: vendor.gstNumber,
                website: vendor.website,
                notes: vendor.notes,
            },
            products: productsWithHistory,
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Failed to fetch vendor detail' });
    }
};