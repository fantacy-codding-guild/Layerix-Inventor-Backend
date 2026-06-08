import prisma from '../lib/prisma';

// Inventory Valuation Report
export const inventoryValuation = async (req: any, res: any) => {
    try {
        const tenantId = req.user.tenantId;
        const { page = 1, limit = 20 } = req.query;
        const skip = (Number(page) - 1) * Number(limit);

        const [products, total] = await Promise.all([
            prisma.product.findMany({
                where: { tenantId },
                include: {
                    stock: true,
                    brand: { select: { name: true } },
                    serviceCategory: { select: { name: true } },
                },
                skip,
                take: Number(limit),
                orderBy: { name: 'asc' },
            }),
            prisma.product.count({ where: { tenantId } }),
        ]);

        const data = products.map((p) => {
            const qty = p.stock?.quantityOnHand ?? 0;
            const avgCost = p.stock?.averageCost ? Number(p.stock.averageCost) : 0;
            return {
                id: p.id,
                productCode: p.productCode,
                name: p.name,
                brand: p.brand?.name,
                category: p.serviceCategory?.name,
                unit: p.unit,
                quantityOnHand: qty,
                averageCost: avgCost,
                totalValue: qty * avgCost,
            };
        });

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
        res.status(500).json({ message: 'Failed to generate inventory report' });
    }
};

// Project Material Consumption Report
export const projectMaterialReport = async (req: any, res: any) => {
    try {
        const tenantId = req.user.tenantId;
        const { projectId } = req.query;
        const where: any = { project: { tenantId } };
        if (projectId) where.projectId = Number(projectId);

        const plans = await prisma.projectMaterialPlan.findMany({
            where,
            include: {
                project: { select: { id: true, name: true } },
                product: { select: { id: true, name: true, productCode: true, unit: true } },
            },
            orderBy: { project: { name: 'asc' } },
        });

        // Group by project
        const grouped: any = {};
        for (const plan of plans) {
            const key = plan.projectId;
            if (!grouped[key]) {
                grouped[key] = {
                    projectId: plan.project.id,
                    projectName: plan.project.name,
                    materials: [],
                };
            }
            grouped[key].materials.push({
                productId: plan.product.id,
                productCode: plan.product.productCode,
                productName: plan.product.name,
                unit: plan.product.unit,
                plannedQuantity: plan.plannedQuantity,
                consumedQuantity: plan.consumedQuantity,
                remainingQuantity: plan.plannedQuantity - plan.consumedQuantity,
            });
        }

        res.json(Object.values(grouped));
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Failed to generate project material report' });
    }
};

// Purchase Summary Report
export const purchaseSummary = async (req: any, res: any) => {
    try {
        const tenantId = req.user.tenantId;
        const { vendorId, status, fromDate, toDate, page = 1, limit = 20 } = req.query;
        const where: any = { tenantId };
        if (vendorId) where.vendorId = Number(vendorId);
        if (status) where.status = { in: String(status).split(',').map((s: string) => s.trim().toUpperCase()) };
        if (fromDate || toDate) {
            where.orderDate = {};
            if (fromDate) where.orderDate.gte = new Date(String(fromDate));
            if (toDate) where.orderDate.lte = new Date(String(toDate));
        }

        const [orders, total] = await Promise.all([
            prisma.purchaseOrder.findMany({
                where,
                include: {
                    vendor: { select: { id: true, name: true } },
                    items: { include: { product: { select: { id: true, name: true, productCode: true } } } },
                },
                orderBy: { orderDate: 'desc' },
                skip: (Number(page) - 1) * Number(limit),
                take: Number(limit),
            }),
            prisma.purchaseOrder.count({ where }),
        ]);

        const data = orders.map((po) => ({
            id: po.id,
            orderNumber: po.orderNumber,
            vendorName: po.vendor.name,
            orderDate: po.orderDate,
            status: po.status,
            totalAmount: po.totalAmount,
            itemCount: po.items.length,
        }));

        res.json({
            data,
            pagination: { page: Number(page), limit: Number(limit), total, totalPages: Math.ceil(total / Number(limit)) },
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Failed to generate purchase report' });
    }
};

// Profitability Overview (simplified – project value minus material cost from stock‑in linked to project)
export const profitabilityReport = async (req: any, res: any) => {
    try {
        const tenantId = req.user.tenantId;
        const { projectId } = req.query;
        const where: any = { tenantId };
        if (projectId) where.id = Number(projectId);

        const projects = await prisma.project.findMany({
            where,
            select: {
                id: true,
                name: true,
                projectValue: true,
                stockMovements: {
                    where: { type: 'STOCK_IN', projectId: { not: null } },
                    select: { unitPrice: true, quantity: true },
                },
            },
        });

        const data = projects.map((proj) => {
            const totalCost = proj.stockMovements.reduce(
                (sum, m) => sum + (Number(m.unitPrice) || 0) * m.quantity,
                0
            );
            const projectValue = Number(proj.projectValue) || 0;
            return {
                id: proj.id,
                name: proj.name,
                projectValue,
                materialCost: totalCost,
                profit: projectValue - totalCost,
            };
        });

        res.json(data);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Failed to generate profitability report' });
    }
};