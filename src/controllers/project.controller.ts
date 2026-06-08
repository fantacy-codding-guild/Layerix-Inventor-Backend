import prisma from '../lib/prisma';
import { z } from 'zod';
import { projectSchema, milestoneSchema, materialPlanSchema } from '../validators/project.validator';

// ---------------- Project CRUD ----------------

export const getProjects = async (req: any, res: any) => {
    try {
        const tenantId = req.user.tenantId;
        const { search, customerId, status, page = 1, limit = 20, sortBy = 'createdAt', sortOrder = 'desc' } = req.query;
        const skip = (Number(page) - 1) * Number(limit);

        const where: any = { tenantId };
        if (search) {
            where.OR = [
                { name: { contains: search, mode: 'insensitive' } },
                { location: { contains: search, mode: 'insensitive' } },
            ];
        }
        if (customerId) where.customerId = Number(customerId);
        if (status) where.status = status.toUpperCase();

        const [projects, total] = await Promise.all([
            prisma.project.findMany({
                where,
                include: {
                    customer: { select: { id: true, name: true, company: true } },
                    projectManager: { select: { id: true, name: true } },
                    _count: { select: { milestones: true, materialPlans: true } },
                },
                orderBy: { [sortBy as string]: sortOrder },
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
                customer: true,
                projectManager: { select: { id: true, name: true } },
                milestones: { orderBy: { orderIndex: 'asc' } },
                materialPlans: {
                    include: { product: { select: { id: true, name: true, productCode: true, unit: true } } },
                },
                reservations: {
                    include: { product: { select: { id: true, name: true, productCode: true } } },
                },
            },
        });
        if (!project) return res.status(404).json({ message: 'Project not found' });
        res.json(project);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Failed to fetch project' });
    }
};

export const createProject = async (req: any, res: any) => {
    try {
        const tenantId = req.user.tenantId;
        const validation = projectSchema.safeParse(req.body);
        if (!validation.success) {
            return res.status(400).json({ message: 'Validation error', errors: validation.error.issues });
        }

        const data = validation.data;
        // Validate customer belongs to tenant
        const customer = await prisma.customer.findFirst({ where: { id: data.customerId, tenantId } });
        if (!customer) return res.status(400).json({ message: 'Customer not found or not accessible' });

        // Validate project manager if provided
        if (data.projectManagerId) {
            const user = await prisma.user.findFirst({ where: { id: data.projectManagerId, tenantId } });
            if (!user) return res.status(400).json({ message: 'Project manager not found or not accessible' });
        }

        const project = await prisma.project.create({
            data: {
                tenantId,
                name: data.name,
                customerId: data.customerId,
                location: data.location,
                projectValue: data.projectValue,
                startDate: data.startDate ? new Date(data.startDate) : undefined,
                endDate: data.endDate ? new Date(data.endDate) : undefined,
                projectManagerId: data.projectManagerId,
                status: data.status || 'NOT_STARTED',
            },
            include: { customer: true },
        });

        // Log activity
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
        const id = parseInt(req.params.id);
        const project = await prisma.project.findFirst({ where: { id, tenantId } });
        if (!project) return res.status(404).json({ message: 'Project not found' });

        const validation = projectSchema.partial().safeParse(req.body);
        if (!validation.success) {
            return res.status(400).json({ message: 'Validation error', errors: validation.error.issues });
        }
        const data = validation.data;

        // Validate references if changed
        if (data.customerId) {
            const customer = await prisma.customer.findFirst({ where: { id: data.customerId, tenantId } });
            if (!customer) return res.status(400).json({ message: 'Customer not found' });
        }
        if (data.projectManagerId) {
            const user = await prisma.user.findFirst({ where: { id: data.projectManagerId, tenantId } });
            if (!user) return res.status(400).json({ message: 'User not found' });
        }

        const updated = await prisma.project.update({
            where: { id },
            data: {
                ...data,
                startDate: data.startDate ? new Date(data.startDate) : undefined,
                endDate: data.endDate ? new Date(data.endDate) : undefined,
            },
            include: { customer: true, projectManager: { select: { id: true, name: true } } },
        });

        // Log activity
        await prisma.activityLog.create({
            data: {
                tenantId,
                userId: req.user.userId,
                action: 'UPDATE',
                entityType: 'Project',
                entityId: id,
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
        const id = parseInt(req.params.id);
        const project = await prisma.project.findFirst({ where: { id, tenantId } });
        if (!project) return res.status(404).json({ message: 'Project not found' });

        // Optionally check if project has stock movements or other dependencies
        await prisma.project.delete({ where: { id } });

        await prisma.activityLog.create({
            data: {
                tenantId,
                userId: req.user.userId,
                action: 'DELETE',
                entityType: 'Project',
                entityId: id,
                details: { name: project.name },
            },
        });

        res.json({ message: 'Project deleted' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Failed to delete project' });
    }
};

// ---------------- Milestones ----------------

export const getMilestones = async (req: any, res: any) => {
    try {
        const tenantId = req.user.tenantId;
        const projectId = parseInt(req.params.id);
        // Verify project belongs to tenant
        const project = await prisma.project.findFirst({ where: { id: projectId, tenantId } });
        if (!project) return res.status(404).json({ message: 'Project not found' });

        const milestones = await prisma.projectMilestone.findMany({
            where: { projectId },
            orderBy: { orderIndex: 'asc' },
        });
        res.json(milestones);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Failed to fetch milestones' });
    }
};

export const createMilestone = async (req: any, res: any) => {
    try {
        const tenantId = req.user.tenantId;
        const projectId = parseInt(req.params.id);
        const project = await prisma.project.findFirst({ where: { id: projectId, tenantId } });
        if (!project) return res.status(404).json({ message: 'Project not found' });

        const validation = milestoneSchema.safeParse(req.body);
        if (!validation.success) {
            return res.status(400).json({ message: 'Validation error', errors: validation.error.issues });
        }
        const data = validation.data;

        const milestone = await prisma.projectMilestone.create({
            data: {
                projectId,
                name: data.name,
                description: data.description,
                startDate: data.startDate ? new Date(data.startDate) : undefined,
                endDate: data.endDate ? new Date(data.endDate) : undefined,
                progress: data.progress ?? 0,
                status: data.status || 'NOT_STARTED',
                orderIndex: data.orderIndex ?? 0,
            },
        });

        // Recalculate project overall progress
        await recalcProjectProgress(projectId);

        res.status(201).json(milestone);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Failed to create milestone' });
    }
};

export const updateMilestone = async (req: any, res: any) => {
    try {
        const tenantId = req.user.tenantId;
        const projectId = parseInt(req.params.id);
        const milestoneId = parseInt(req.params.milestoneId);
        const project = await prisma.project.findFirst({ where: { id: projectId, tenantId } });
        if (!project) return res.status(404).json({ message: 'Project not found' });

        const milestone = await prisma.projectMilestone.findFirst({
            where: { id: milestoneId, projectId },
        });
        if (!milestone) return res.status(404).json({ message: 'Milestone not found' });

        const validation = milestoneSchema.partial().safeParse(req.body);
        if (!validation.success) {
            return res.status(400).json({ message: 'Validation error', errors: validation.error.issues });
        }
        const data = validation.data;

        const updated = await prisma.projectMilestone.update({
            where: { id: milestoneId },
            data: {
                ...data,
                startDate: data.startDate ? new Date(data.startDate) : undefined,
                endDate: data.endDate ? new Date(data.endDate) : undefined,
            },
        });

        // Recalculate project overall progress
        await recalcProjectProgress(projectId);

        res.json(updated);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Failed to update milestone' });
    }
};

export const deleteMilestone = async (req: any, res: any) => {
    try {
        const tenantId = req.user.tenantId;
        const projectId = parseInt(req.params.id);
        const milestoneId = parseInt(req.params.milestoneId);
        const project = await prisma.project.findFirst({ where: { id: projectId, tenantId } });
        if (!project) return res.status(404).json({ message: 'Project not found' });

        const milestone = await prisma.projectMilestone.findFirst({
            where: { id: milestoneId, projectId },
        });
        if (!milestone) return res.status(404).json({ message: 'Milestone not found' });

        await prisma.projectMilestone.delete({ where: { id: milestoneId } });

        await recalcProjectProgress(projectId);

        res.json({ message: 'Milestone deleted' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Failed to delete milestone' });
    }
};

// ---------------- Material Plans ----------------

export const getMaterialPlans = async (req: any, res: any) => {
    try {
        const tenantId = req.user.tenantId;
        const projectId = parseInt(req.params.id);
        const project = await prisma.project.findFirst({ where: { id: projectId, tenantId } });
        if (!project) return res.status(404).json({ message: 'Project not found' });

        const { milestoneId } = req.query;
        const where: any = { projectId };
        if (milestoneId) where.milestoneId = parseInt(milestoneId);

        const plans = await prisma.projectMaterialPlan.findMany({
            where,
            include: {
                product: { select: { id: true, name: true, productCode: true, unit: true } },
                milestone: { select: { id: true, name: true } },
            },
        });
        res.json(plans);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Failed to fetch material plans' });
    }
};

export const addMaterialPlan = async (req: any, res: any) => {
    try {
        const tenantId = req.user.tenantId;
        const projectId = parseInt(req.params.id);
        const project = await prisma.project.findFirst({ where: { id: projectId, tenantId } });
        if (!project) return res.status(404).json({ message: 'Project not found' });

        // Extend validation to include optional milestoneId
        const validation = z.object({
            productId: z.number().int().positive(),
            plannedQuantity: z.number().int().positive(),
            milestoneId: z.number().int().positive().optional(),
        }).safeParse(req.body);
        if (!validation.success) {
            return res.status(400).json({ message: 'Validation error', errors: validation.error.issues });
        }

        const { productId, plannedQuantity, milestoneId } = validation.data;

        // Verify product belongs to tenant
        const product = await prisma.product.findFirst({ where: { id: productId, tenantId } });
        if (!product) return res.status(400).json({ message: 'Product not found' });

        // If milestoneId provided, verify it belongs to this project
        if (milestoneId) {
            const milestone = await prisma.projectMilestone.findFirst({
                where: { id: milestoneId, projectId },
            });
            if (!milestone) return res.status(400).json({ message: 'Milestone not found or does not belong to this project' });
        }

        // Create the plan (no unique constraint, so just create)
        const plan = await prisma.projectMaterialPlan.create({
            data: {
                projectId,
                productId,
                plannedQuantity,
                milestoneId: milestoneId || null,
            },
            include: {
                product: { select: { id: true, name: true, productCode: true, unit: true } },
                milestone: { select: { id: true, name: true } },
            },
        });

        res.status(201).json(plan);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Failed to add material plan' });
    }
};

export const updateMaterialPlan = async (req: any, res: any) => {
    try {
        const tenantId = req.user.tenantId;
        const projectId = parseInt(req.params.id);
        const planId = parseInt(req.params.planId);
        const project = await prisma.project.findFirst({ where: { id: projectId, tenantId } });
        if (!project) return res.status(404).json({ message: 'Project not found' });

        const plan = await prisma.projectMaterialPlan.findFirst({
            where: { id: planId, projectId },
        });
        if (!plan) return res.status(404).json({ message: 'Material plan not found' });

        const validation = z.object({
            plannedQuantity: z.number().int().positive().optional(),
            consumedQuantity: z.number().int().min(0).optional(),
            milestoneId: z.number().int().positive().optional().nullable(), // allow null to unlink
        }).safeParse(req.body);
        if (!validation.success) {
            return res.status(400).json({ message: 'Validation error', errors: validation.error.issues });
        }

        // If updating milestoneId, verify the milestone belongs to this project
        if (validation.data.milestoneId) {
            const milestone = await prisma.projectMilestone.findFirst({
                where: { id: validation.data.milestoneId, projectId },
            });
            if (!milestone) return res.status(400).json({ message: 'Milestone not found in this project' });
        }

        const updated = await prisma.projectMaterialPlan.update({
            where: { id: planId },
            data: {
                ...validation.data,
                milestoneId: validation.data.milestoneId, // null clears it
            },
            include: {
                product: { select: { id: true, name: true, productCode: true, unit: true } },
                milestone: { select: { id: true, name: true } },
            },
        });

        res.json(updated);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Failed to update material plan' });
    }
};

export const deleteMaterialPlan = async (req: any, res: any) => {
    try {
        const tenantId = req.user.tenantId;
        const projectId = parseInt(req.params.id);
        const planId = parseInt(req.params.planId);
        const project = await prisma.project.findFirst({ where: { id: projectId, tenantId } });
        if (!project) return res.status(404).json({ message: 'Project not found' });

        const plan = await prisma.projectMaterialPlan.findFirst({
            where: { id: planId, projectId },
        });
        if (!plan) return res.status(404).json({ message: 'Material plan not found' });

        await prisma.projectMaterialPlan.delete({ where: { id: planId } });

        res.json({ message: 'Material plan removed' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Failed to delete material plan' });
    }
};

// Helper: recalculate overall project progress as average of milestone progresses
async function recalcProjectProgress(projectId: number) {
    const milestones = await prisma.projectMilestone.findMany({
        where: { projectId },
        select: { progress: true },
    });
    const count = milestones.length;
    const avg = count === 0 ? 0 : milestones.reduce((sum, m) => sum + m.progress, 0) / count;
    await prisma.project.update({
        where: { id: projectId },
        data: { overallProgress: Math.round(avg * 100) / 100 }, // round to 2 decimals
    });
}