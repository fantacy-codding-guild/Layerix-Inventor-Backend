import prisma from '../lib/prisma';
import { z } from 'zod';

// ─── Validation (simplified – removed projectType, customerId, status, city, startDate, endDate) ───
const projectSchema = z.object({
    name: z.string().min(1, 'Name is required').max(200),
    code: z.string().optional(),
    stateId: z.number().optional().nullable(),
    district: z.string().optional(),
    siteAddress: z.string().optional(),
    projectValue: z.number().optional().nullable(),
    completionPercent: z.number().min(0).max(100).optional(),
    projectManagerId: z.number().optional().nullable(),
});

const updateProjectSchema = projectSchema.partial();

// ─── Helpers ────────────────────────────────────────────────────
async function attachMaterialAggregation(project: any) {
    const aggregations = await prisma.projectMaterialPlan.aggregate({
        where: { projectId: project.id },
        _sum: { plannedQuantity: true, consumedQuantity: true },
    });
    project.totalAllocated = aggregations._sum.plannedQuantity ?? 0;
    project.totalConsumed = aggregations._sum.consumedQuantity ?? 0;
    project.totalRemaining = project.totalAllocated - project.totalConsumed;
    return project;
}

// ─── List / Search (removed customerId & status filters) ────────
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

        const data = await Promise.all(projects.map(p => attachMaterialAggregation(p)));

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
        res.status(500).json({ message: 'Failed to fetch projects' });
    }
};

// ─── Single project detail ────────────────────────────────────
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
                milestones: { orderBy: { orderIndex: 'asc' } },
                materialPlans: {
                    include: {
                        product: { select: { id: true, name: true, unit: true } },
                        milestone: { select: { id: true, name: true } },
                    },
                    orderBy: { product: { name: 'asc' } },
                },
                reservations: {
                    include: { product: { select: { id: true, name: true } } },
                    where: { status: { not: 'CANCELLED' } },
                },
                stockMovements: {
                    take: 50,
                    orderBy: { date: 'desc' },
                    include: {
                        product: { select: { id: true, name: true } },
                        user: { select: { id: true, name: true } },
                    },
                },
                projectStock: {
                    include: { product: { select: { id: true, name: true } } },
                },
                incomingTransfers: {
                    include: {
                        items: { include: { product: { select: { id: true, name: true } } } },
                        fromProject: { select: { id: true, name: true } },
                    },
                },
                outgoingTransfers: {
                    include: {
                        items: { include: { product: { select: { id: true, name: true } } } },
                        toProject: { select: { id: true, name: true } },
                    },
                },
            },
        });

        if (!project) return res.status(404).json({ message: 'Project not found' });
        await attachMaterialAggregation(project);
        res.json(project);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Failed to fetch project details' });
    }
};

// ─── Create (no customerId, status, city, startDate, endDate, projectType) ───
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

        // Validate state (if provided)
        if (data.stateId) {
            const state = await prisma.state.findFirst({ where: { id: data.stateId, tenantId } });
            if (!state) return res.status(400).json({ message: 'State not found' });
        }
        // Validate project manager (if provided)
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
                // Fields that were removed are not set – they will default to null/0
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

// ─── Update (removed fields as well) ──────────────────────────
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

        // Optional validations for state and manager
        if (data.stateId) {
            const st = await prisma.state.findFirst({ where: { id: data.stateId, tenantId } });
            if (!st) return res.status(400).json({ message: 'State not found' });
        }
        if (data.projectManagerId) {
            const mgr = await prisma.user.findFirst({ where: { id: data.projectManagerId, tenantId } });
            if (!mgr) return res.status(400).json({ message: 'Manager not found' });
        }

        const updateData: any = { ...data };

        const updated = await prisma.project.update({
            where: { id: projectId },
            data: updateData,
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

// ─── Delete (unchanged) ──────────────────────────────────────
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