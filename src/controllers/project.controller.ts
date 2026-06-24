import prisma from '../lib/prisma';
import { z } from 'zod';

const projectSchema = z.object({
    name: z.string().min(1).max(200),
    code: z.string().optional(),
    stateId: z.number().optional().nullable(),
    district: z.string().optional(),
    siteAddress: z.string().optional(),
    projectValue: z.number().optional().nullable(),
    completionPercent: z.number().min(0).max(100).optional(),
    projectManagerId: z.number().optional().nullable(),
});

const updateProjectSchema = projectSchema.partial();

// Helper to calculate material totals
async function attachMaterialAggregation(projectId: number) {
    const allocated = await prisma.stockMovement.aggregate({
        where: { toProjectId: projectId, type: 'STOCK_IN' },
        _sum: { quantity: true },
    });
    const consumed = await prisma.stockMovement.aggregate({
        where: { toProjectId: projectId, type: 'STOCK_OUT', notes: { not: { contains: 'Return to office' } } },
        _sum: { quantity: true },
    });
    const returned = await prisma.stockMovement.aggregate({
        where: { toProjectId: projectId, type: 'STOCK_OUT', notes: { contains: 'Return to office' } },
        _sum: { quantity: true },
    });

    return {
        totalAllocated: allocated._sum.quantity ?? 0,
        totalConsumed: consumed._sum.quantity ?? 0,
        totalRemaining:
            (allocated._sum.quantity ?? 0) -
            (consumed._sum.quantity ?? 0) -
            (returned._sum.quantity ?? 0),
    };
}

export const getProjects = async (req: any, res: any) => {
    try {
        const tenantId = req.user.tenantId;
        const { search, stateId, page = 1, limit = 20 } = req.query;
        const skip = (Number(page) - 1) * Number(limit);

        const where: any = { tenantId };
        if (search) {
            where.OR = [
                { name: { contains: search, mode: 'insensitive' } },
                { code: { contains: search, mode: 'insensitive' } },
            ];
        }
        if (stateId) where.stateId = Number(stateId);

        const [projects, total] = await Promise.all([
            prisma.project.findMany({
                where,
                include: {
                    customer: { select: { id: true, name: true } },
                    state: { select: { id: true, name: true, code: true } },
                    projectManager: { select: { id: true, name: true } },
                },
                orderBy: { createdAt: 'desc' },
                skip,
                take: Number(limit),
            }),
            prisma.project.count({ where }),
        ]);

        res.json({
            data: projects,
            pagination: {
                page: Number(page),
                limit: Number(limit),
                total,
                totalPages: Math.ceil(total / Number(limit)),
            },
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Failed to fetch projects' });
    }
};

export const getProject = async (req: any, res: any) => {
    try {
        const tenantId = req.user.tenantId;
        const id = parseInt(req.params.id);

        const project = await prisma.project.findFirst({
            where: { id, tenantId },
            include: {
                customer: { select: { id: true, name: true } },
                state: { select: { id: true, name: true, code: true } },
                projectManager: { select: { id: true, name: true } },
                projectStock: { include: { product: { select: { id: true, name: true } } } },
                stockMovements: {
                    take: 50,
                    orderBy: { date: 'desc' },
                    include: {
                        product: { select: { id: true, name: true } },
                        user: { select: { id: true, name: true } },
                    },
                },
            },
        });

        if (!project) return res.status(404).json({ message: 'Project not found' });

        // Aggregations
        const totalAllocated = await prisma.projectStock.aggregate({
            where: { projectId: project.id },
            _sum: { quantityOnSite: true },
        });
        const consumedMovements = await prisma.stockMovement.aggregate({
            where: {
                toProjectId: project.id,
                type: 'STOCK_OUT',
                notes: { not: { contains: 'Return to office' } },
            },
            _sum: { quantity: true },
        });
        const returnedMovements = await prisma.stockMovement.aggregate({
            where: {
                toProjectId: project.id,
                type: 'STOCK_OUT',
                notes: { contains: 'Return to office' },
            },
            _sum: { quantity: true },
        });

        const result = {
            ...project,
            totalAllocated: totalAllocated._sum.quantityOnSite ?? 0,
            totalConsumed: consumedMovements._sum.quantity ?? 0,
            totalRemaining:
                (totalAllocated._sum.quantityOnSite ?? 0) -
                (consumedMovements._sum.quantity ?? 0) -
                (returnedMovements._sum.quantity ?? 0),
        };

        res.json(result);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Failed to fetch project details' });
    }
};


export const createProject = async (req: any, res: any) => {
    try {
        const tenantId = req.user.tenantId;
        const validation = projectSchema.safeParse(req.body);
        if (!validation.success) {
            return res.status(400).json({
                message: 'Validation error',
                errors: validation.error.issues.map(i => ({ field: i.path.join('.'), message: i.message })),
            });
        }

        const data = validation.data;

        if (data.stateId) {
            const state = await prisma.state.findFirst({ where: { id: data.stateId, tenantId } });
            if (!state) return res.status(400).json({ message: 'State not found' });
        }
        if (data.projectManagerId) {
            const manager = await prisma.user.findFirst({ where: { id: data.projectManagerId, tenantId } });
            if (!manager) return res.status(400).json({ message: 'Project manager not found' });
        }

        const project = await prisma.project.create({
            data: {
                tenantId,
                name: data.name,
                code: data.code || null,
                stateId: data.stateId ?? null,
                district: data.district,
                siteAddress: data.siteAddress,
                projectValue: data.projectValue,
                completionPercent: data.completionPercent ?? 0,
                projectManagerId: data.projectManagerId ?? null,
            },
        });

        await prisma.activityLog.create({
            data: {
                tenantId,
                userId: req.user.userId,
                action: 'CREATE',
                entityType: 'Project',
                entityId: project.id,
                details: { name: project.name },
            },
        });

        res.status(201).json(project);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Failed to create project' });
    }
};

export const updateProject = async (req: any, res: any) => {
    try {
        const tenantId = req.user.tenantId;
        const projectId = parseInt(req.params.id);

        const existing = await prisma.project.findFirst({ where: { id: projectId, tenantId } });
        if (!existing) return res.status(404).json({ message: 'Project not found' });

        const validation = updateProjectSchema.safeParse(req.body);
        if (!validation.success) {
            return res.status(400).json({
                message: 'Validation error',
                errors: validation.error.issues.map(i => ({ field: i.path.join('.'), message: i.message })),
            });
        }

        const data = validation.data;

        if (data.stateId) {
            const st = await prisma.state.findFirst({ where: { id: data.stateId, tenantId } });
            if (!st) return res.status(400).json({ message: 'State not found' });
        }
        if (data.projectManagerId) {
            const mgr = await prisma.user.findFirst({ where: { id: data.projectManagerId, tenantId } });
            if (!mgr) return res.status(400).json({ message: 'Manager not found' });
        }

        const updated = await prisma.project.update({
            where: { id: projectId },
            data: { ...data },
        });

        await prisma.activityLog.create({
            data: {
                tenantId,
                userId: req.user.userId,
                action: 'UPDATE',
                entityType: 'Project',
                entityId: projectId,
                details: { changes: data },
            },
        });

        res.json(updated);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Failed to update project' });
    }
};

export const deleteProject = async (req: any, res: any) => {
    try {
        const tenantId = req.user.tenantId;
        const projectId = parseInt(req.params.id);

        const existing = await prisma.project.findFirst({ where: { id: projectId, tenantId } });
        if (!existing) return res.status(404).json({ message: 'Project not found' });

        await prisma.project.delete({ where: { id: projectId } });

        await prisma.activityLog.create({
            data: {
                tenantId,
                userId: req.user.userId,
                action: 'DELETE',
                entityType: 'Project',
                entityId: projectId,
                details: { name: existing.name },
            },
        });

        res.json({ message: 'Project deleted successfully' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Failed to delete project' });
    }
};