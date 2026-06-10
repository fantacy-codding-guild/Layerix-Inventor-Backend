import prisma from '../lib/prisma';

export const inventorySummary = async (req: any, res: any) => {
    try {
        const tenantId = req.user.tenantId;

        // Fetch all products with stock for this tenant
        const products = await prisma.product.findMany({
            where: { tenantId },
            include: {
                stock: true,
                brand: { select: { name: true } },
            },
        });

        // Compute total inventory value and enrich each product
        let totalValue = 0;
        const enriched = products.map((p) => {
            const qty = p.stock?.quantityOnHand ?? 0;
            const avgCost = p.stock?.averageCost ? Number(p.stock.averageCost) : 0;
            const value = qty * avgCost;
            totalValue += value;
            return {
                id: p.id,
                name: p.name,
                brand: p.brand?.name || '—',
                quantityOnHand: qty,
                averageCost: avgCost,
                totalValue: value,
            };
        });

        // Top 3 by value
        const topByValue = [...enriched]
            .sort((a, b) => b.totalValue - a.totalValue)
            .slice(0, 3);

        // Top 3 by quantity
        const topByQty = [...enriched]
            .sort((a, b) => b.quantityOnHand - a.quantityOnHand)
            .slice(0, 3);

        res.json({
            totalValue,
            topByValue,
            topByQty,
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Failed to fetch dashboard summary' });
    }
};