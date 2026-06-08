import prisma from '../lib/prisma';

// GET /api/activity-logs
export const getActivityLogs = async (req: any, res: any) => {
    try {
        const tenantId = req.user.tenantId;
        const { userId, action, entityType, page = 1, limit = 20 } = req.query;
        const where: any = { tenantId };

        if (userId) where.userId = Number(userId);
        if (action) where.action = action.toUpperCase();
        if (entityType) where.entityType = entityType.toUpperCase();

        const [logs, total] = await Promise.all([
            prisma.activityLog.findMany({
                where,
                include: { user: { select: { id: true, name: true } } },
                orderBy: { createdAt: 'desc' },
                skip: (Number(page) - 1) * Number(limit),
                take: Number(limit),
            }),
            prisma.activityLog.count({ where }),
        ]);

        res.json({
            data: logs,
            pagination: {
                page: Number(page),
                limit: Number(limit),
                total,
                totalPages: Math.ceil(total / Number(limit)),
            },
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Failed to fetch activity logs' });
    }
};