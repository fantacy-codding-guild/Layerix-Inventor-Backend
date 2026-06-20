// backend/src/controllers/dashboard.controller.ts
import prisma from '../lib/prisma';

export const inventorySummary = async (req: any, res: any) => {
    try {
        const tenantId = req.user.tenantId;

        // Fetch all inventory items (per brand/unit/vendor)
        const inventoryItems = await prisma.inventoryItem.findMany({
            where: { tenantId },
            include: {
                product: { select: { id: true, name: true } },
                vendor: { select: { id: true, name: true } },
            },
        });

        // Aggregate by product + brand + unit
        const aggregated: Record<string, {
            productId: number;
            productName: string;
            brand: string;
            unit: string;
            totalQty: number;
            totalValue: number;  // sum of qty * avgCost
        }> = {};

        for (const item of inventoryItems) {
            const key = `${item.productId}_${item.brand}_${item.unit}`;
            if (!aggregated[key]) {
                aggregated[key] = {
                    productId: item.productId,
                    productName: item.product.name,
                    brand: item.brand,
                    unit: item.unit,
                    totalQty: 0,
                    totalValue: 0,
                };
            }
            const qty = item.quantityOnHand;
            const avgCost = item.averageCost ? Number(item.averageCost) : 0;
            aggregated[key].totalQty += qty;
            aggregated[key].totalValue += qty * avgCost;
        }

        // Convert to array and compute average cost
        const enriched = Object.values(aggregated).map(agg => ({
            id: agg.productId,                // we use productId as id (not unique, but fine for display)
            name: agg.productName,
            brand: agg.brand,
            unit: agg.unit,
            quantityOnHand: agg.totalQty,
            averageCost: agg.totalQty > 0 ? agg.totalValue / agg.totalQty : 0,
            totalValue: agg.totalValue,
        }));

        const totalValue = enriched.reduce((sum, item) => sum + item.totalValue, 0);

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