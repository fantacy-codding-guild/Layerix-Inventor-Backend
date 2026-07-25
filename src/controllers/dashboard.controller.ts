// backend/src/controllers/dashboard.controller.ts
import prisma from '../lib/prisma';

export const inventorySummary = async (req: any, res: any) => {
    try {
        const tenantId = req.user.tenantId;

        // ─── 1. Fetch Office Inventory ───────────────────────
        const officeItems = await prisma.inventoryItem.findMany({
            where: { tenantId },
            include: {
                product: { select: { id: true, name: true } },
            },
        });

        // ─── 2. Fetch Project Stock with product unit ────────
        const projectStocks = await prisma.projectStock.findMany({
            where: { project: { tenantId } },
            include: {
                product: { select: { id: true, name: true, unit: true } },  // ✅ include unit
                project: { select: { id: true, name: true } },
            },
        });

        // ─── 3. Get latest average cost for all products ─────
        const productIds = [...new Set([
            ...officeItems.map(i => i.productId),
            ...projectStocks.map(ps => ps.productId)
        ])];
        const avgCosts = await prisma.inventoryItem.findMany({
            where: { tenantId, productId: { in: productIds } },
            orderBy: { updatedAt: 'desc' },
            distinct: ['productId'],
            select: { productId: true, averageCost: true },
        });
        const avgCostMap = Object.fromEntries(
            avgCosts.map(a => [a.productId, a.averageCost ? Number(a.averageCost) : 0])
        );

        // ─── 4. Aggregate Office + Project ────────────────────
        const combined: Record<string, any> = {};

        // Office items
        for (const item of officeItems) {
            const key = `office_${item.productId}_${item.brand}_${item.unit}`;
            const qty = item.quantityOnHand;
            const avg = avgCostMap[item.productId] || 0;
            if (!combined[key]) {
                combined[key] = {
                    productId: item.productId,
                    productName: item.product.name,
                    location: 'office',
                    brand: item.brand,
                    unit: item.unit,
                    quantityOnHand: 0,
                    averageCost: avg,
                    totalValue: 0,
                };
            }
            combined[key].quantityOnHand += qty;
            combined[key].totalValue += qty * avg;
            combined[key].averageCost = avg;
        }

        // Project items
        for (const ps of projectStocks) {
            const key = `project_${ps.projectId}_${ps.productId}`;
            const avg = avgCostMap[ps.productId] || 0;
            if (!combined[key]) {
                combined[key] = {
                    productId: ps.productId,
                    productName: ps.product.name,
                    location: 'project',
                    projectName: ps.project.name,
                    brand: '',  // project stock doesn't have brand; leave empty
                    unit: ps.product.unit,  // ✅ now available
                    quantityOnHand: 0,
                    averageCost: avg,
                    totalValue: 0,
                };
            }
            combined[key].quantityOnHand += ps.quantityOnSite;
            combined[key].totalValue += ps.quantityOnSite * avg;
            combined[key].averageCost = avg;
        }

        const allItems = Object.values(combined);
        const totalValue = allItems.reduce((s, i) => s + i.totalValue, 0);

        const officeTotal = officeItems.reduce((s, i) => {
            const avg = avgCostMap[i.productId] || 0;
            return s + i.quantityOnHand * avg;
        }, 0);

        const projectTotal = projectStocks.reduce((s, ps) => {
            const avg = avgCostMap[ps.productId] || 0;
            return s + ps.quantityOnSite * avg;
        }, 0);

        const topByValue = [...allItems].sort((a, b) => b.totalValue - a.totalValue).slice(0, 5);
        const topByQty = [...allItems].sort((a, b) => b.quantityOnHand - a.quantityOnHand).slice(0, 5);

        res.json({
            totalValue,
            officeTotalValue: officeTotal,
            projectTotalValue: projectTotal,
            topByValue,
            topByQty,
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Failed to fetch dashboard summary' });
    }
};