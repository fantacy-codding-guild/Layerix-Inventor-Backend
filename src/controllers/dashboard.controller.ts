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

export const inventoryTrend = async (req: any, res: any) => {
    try {
        const tenantId = req.user.tenantId;
        const range = parseInt(req.query.range) || 12;
        const endDate = new Date();
        const startDate = new Date();
        startDate.setMonth(startDate.getMonth() - range);

        // ─── Get current totals ──────────────────────────────
        const officeItems = await prisma.inventoryItem.findMany({
            where: { tenantId },
            include: { product: { select: { id: true, name: true } } },
        });
        const projectStocks = await prisma.projectStock.findMany({
            where: { project: { tenantId } },
            include: { product: { select: { id: true, name: true } } },
        });
        const allProductIds = [
            ...new Set([
                ...officeItems.map(i => i.productId),
                ...projectStocks.map(ps => ps.productId)
            ])
        ];
        const avgCosts = await prisma.inventoryItem.findMany({
            where: { tenantId, productId: { in: allProductIds } },
            orderBy: { updatedAt: 'desc' },
            distinct: ['productId'],
            select: { productId: true, averageCost: true },
        });
        const avgCostMap = Object.fromEntries(
            avgCosts.map(a => [a.productId, a.averageCost ? Number(a.averageCost) : 0])
        );

        let currentValue = 0, currentQty = 0;
        officeItems.forEach(item => {
            const avg = avgCostMap[item.productId] || 0;
            currentValue += item.quantityOnHand * avg;
            currentQty += item.quantityOnHand;
        });
        projectStocks.forEach(ps => {
            const avg = avgCostMap[ps.productId] || 0;
            currentValue += ps.quantityOnSite * avg;
            currentQty += ps.quantityOnSite;
        });

        // ─── Fetch movements in date range ────────────────────
        const movements = await prisma.stockMovement.findMany({
            where: {
                tenantId,
                date: { gte: startDate, lte: endDate },
                type: { in: ['STOCK_IN', 'STOCK_OUT'] },
            },
            select: { date: true, type: true, quantity: true, unitPrice: true },
        });

        // Group net changes by month
        const monthlyNet: Record<string, { netValue: number; netQty: number }> = {};
        movements.forEach(m => {
            const monthKey = m.date.toISOString().slice(0, 7);
            if (!monthlyNet[monthKey]) monthlyNet[monthKey] = { netValue: 0, netQty: 0 };
            // ✅ Fix: Convert Decimal to number
            const unitPrice = m.unitPrice ? Number(m.unitPrice) : 0;
            const val = m.quantity * unitPrice;
            if (m.type === 'STOCK_IN') {
                monthlyNet[monthKey].netValue += val;
                monthlyNet[monthKey].netQty += m.quantity;
            } else {
                monthlyNet[monthKey].netValue -= val;
                monthlyNet[monthKey].netQty -= m.quantity;
            }
        });

        const sortedMonths = Object.keys(monthlyNet).sort();
        if (sortedMonths.length === 0) {
            return res.json([{
                month: new Date().toISOString().slice(0, 7),
                totalValue: currentValue,
                totalQuantity: currentQty,
            }]);
        }

        const totalNetValue = Object.values(monthlyNet).reduce((acc, n) => acc + n.netValue, 0);
        const totalNetQty = Object.values(monthlyNet).reduce((acc, n) => acc + n.netQty, 0);
        let accValue = currentValue - totalNetValue;
        let accQty = currentQty - totalNetQty;

        const trendData = sortedMonths.map(monthKey => {
            const net = monthlyNet[monthKey];
            accValue += net.netValue;
            accQty += net.netQty;
            return {
                month: monthKey,
                totalValue: Math.round(accValue),
                totalQuantity: Math.round(accQty),
            };
        });

        res.json(trendData);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Failed to fetch inventory trend' });
    }
};