import prisma from '../lib/prisma';
import { serviceCategorySchema } from '../validators/serviceCategory.validator';

export const getServiceCategories = async (req: any, res: any) => {
    try {
        const categories = await prisma.serviceCategory.findMany({
            where: { tenantId: req.user.tenantId },
            orderBy: { name: 'asc' },
        });
        res.json(categories);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Failed to fetch categories' });
    }
};

export const createServiceCategory = async (req: any, res: any) => {
    try {
        const validation = serviceCategorySchema.safeParse(req.body);
        if (!validation.success) return res.status(400).json({ message: 'Validation error', errors: validation.error.issues });
        const { name, description } = validation.data;
        const tenantId = req.user.tenantId;

        const exists = await prisma.serviceCategory.findFirst({
            where: { tenantId, name: { equals: name, mode: 'insensitive' } },
        });
        if (exists) return res.status(409).json({ message: 'Category name already exists' });

        const category = await prisma.serviceCategory.create({
            data: { tenantId, name, description },
        });
        res.status(201).json(category);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Failed to create category' });
    }
};

export const updateServiceCategory = async (req: any, res: any) => {
    try {
        const validation = serviceCategorySchema.safeParse(req.body);
        if (!validation.success) return res.status(400).json({ message: 'Validation error', errors: validation.error.issues });
        const { name, description } = validation.data;
        const tenantId = req.user.tenantId;
        const id = parseInt(req.params.id);

        const exists = await prisma.serviceCategory.findFirst({ where: { id, tenantId } });
        if (!exists) return res.status(404).json({ message: 'Category not found' });

        const duplicate = await prisma.serviceCategory.findFirst({
            where: { tenantId, name: { equals: name, mode: 'insensitive' }, NOT: { id } },
        });
        if (duplicate) return res.status(409).json({ message: 'Another category with this name exists' });

        const updated = await prisma.serviceCategory.update({
            where: { id },
            data: { name, description },
        });
        res.json(updated);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Failed to update category' });
    }
};

export const deleteServiceCategory = async (req: any, res: any) => {
    try {
        const tenantId = req.user.tenantId;
        const id = parseInt(req.params.id);
        const category = await prisma.serviceCategory.findFirst({ where: { id, tenantId } });
        if (!category) return res.status(404).json({ message: 'Category not found' });

        const productCount = await prisma.product.count({ where: { serviceCategoryId: id } });
        if (productCount > 0) return res.status(409).json({ message: 'Cannot delete category with existing products.' });

        await prisma.serviceCategory.delete({ where: { id } });
        res.json({ message: 'Category deleted' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Failed to delete category' });
    }
};