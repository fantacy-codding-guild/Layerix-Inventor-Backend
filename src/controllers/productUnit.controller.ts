import prisma from '../lib/prisma';

export const getProductUnits = async (req: any, res: any) => {
    try {
        const productId = parseInt(req.params.id);
        const tenantId = req.user.tenantId;

        // Verify product exists
        const product = await prisma.product.findFirst({
            where: { id: productId, tenantId },
            select: { unit: true },
        });
        if (!product) return res.status(404).json({ message: 'Product not found' });

        // Fetch all units from the conversion table
        const units = await prisma.productUnit.findMany({
            where: { productId },
            select: { unit: true, conversionFactor: true },
        });

        // Always include the product’s own base unit if not already present
        const hasBase = units.some(u => u.unit === product.unit);
        if (!hasBase) {
            units.unshift({
                unit: product.unit,
                conversionFactor: 1,
            });
        }

        res.json(units);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Failed to fetch product units' });
    }
};