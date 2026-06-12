import prisma from '../lib/prisma';
import { brandSchema } from '../validators/brand.validator';

export const getBrands = async (req: any, res: any) => {
    try {
        const brands = await prisma.brand.findMany({
            where: { tenantId: req.user.tenantId },
            orderBy: { name: 'asc' },
        });
        res.json(brands);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Failed to fetch brands' });
    }
};

export const createBrand = async (req: any, res: any) => {
    try {
        const validation = brandSchema.safeParse(req.body);
        if (!validation.success) {
            return res.status(400).json({ message: 'Validation error', errors: validation.error.issues });
        }
        const { name } = validation.data;
        const tenantId = req.user.tenantId;

        // Check duplicate
        const exists = await prisma.brand.findFirst({
            where: { tenantId, name: { equals: name, mode: 'insensitive' } },
        });
        if (exists) return res.status(409).json({ message: 'Brand name already exists' });

        const brand = await prisma.brand.create({
            data: { tenantId, name },
        });

        res.status(201).json(brand);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Failed to create brand' });
    }
};

export const updateBrand = async (req: any, res: any) => {
    try {
        const validation = brandSchema.safeParse(req.body);
        if (!validation.success) {
            return res.status(400).json({ message: 'Validation error', errors: validation.error.issues });
        }
        const { name } = validation.data;
        const tenantId = req.user.tenantId;
        const id = parseInt(req.params.id);

        const exists = await prisma.brand.findFirst({ where: { id, tenantId } });
        if (!exists) return res.status(404).json({ message: 'Brand not found' });

        // Check duplicate excluding self
        const duplicate = await prisma.brand.findFirst({
            where: { tenantId, name: { equals: name, mode: 'insensitive' }, NOT: { id } },
        });
        if (duplicate) return res.status(409).json({ message: 'Another brand with this name exists' });

        const updated = await prisma.brand.update({
            where: { id },
            data: { name },
        });

        res.json(updated);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Failed to update brand' });
    }
};

export const deleteBrand = async (req: any, res: any) => {
    try {
        const tenantId = req.user.tenantId;
        const id = parseInt(req.params.id);

        const brand = await prisma.brand.findFirst({ where: { id, tenantId } });
        if (!brand) return res.status(404).json({ message: 'Brand not found' });

        // Check if any products are linked through the join table
        const productCount = await prisma.productBrand.count({
            where: { brandId: id },
        });
        if (productCount > 0) {
            return res.status(409).json({ message: 'Cannot delete brand with existing product associations.' });
        }

        await prisma.brand.delete({ where: { id } });
        res.json({ message: 'Brand deleted' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Failed to delete brand' });
    }
};