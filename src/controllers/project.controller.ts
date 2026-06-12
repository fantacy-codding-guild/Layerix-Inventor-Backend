import prisma from '../lib/prisma';
import { z } from 'zod';
import { projectSchema, milestoneSchema, materialPlanSchema } from '../validators/project.validator';

// ---------------- Project CRUD ----------------


export const getProjects = async (req: any, res: any) => {
    try {
        const tenantId = req.user.tenantId;
        const { search, customerId, stateId, status, page = 1, limit = 20, sortBy = 'createdAt', sortOrder = 'desc' } = req.query;
        const skip = (Number(page) - 1) * Number(limit);

        const where: any = { tenantId };
        if (search) {
            where.OR = [
                { name: { contains: search, mode: 'insensitive' } },
                { code: { contains: search, mode: 'insensitive' } },
                { location: { contains: search, mode: 'insensitive' } },
            ];
        }
        if (customerId) where.customerId = Number(customerId);
        if (stateId) where.stateId = Number(stateId);
        if (status) where.status = status.toUpperCase();

        const [projects, total] = await Promise.all([
            prisma.project.findMany({
                where,
                include: {
                    customer: { select: { id: true, name: true, company: true } },
                    state: { select: { id: true, name: true, code: true } },
                    projectManager: { select: { id: true, name: true } },
                    materialPlans: {
                        select: { plannedQuantity: true, consumedQuantity: true },
                    },
                    _count: { select: { milestones: true } },
                },
                orderBy: { [sortBy as string]: sortOrder },
                skip,
                take: Number(limit),
            }),
            prisma.project.count({ where }),
        ]);

        // Enrich projects with inventory summary
        const data = projects.map((p) => {
            const totalAllocated = p.materialPlans.reduce((sum, mp) => sum + mp.plannedQuantity, 0);
            const totalConsumed = p.materialPlans.reduce((sum, mp) => sum + mp.consumedQuantity, 0);
            return {
                id: p.id,
                name: p.name,
                code: p.code,
                customer: p.customer,
                state: p.state,
                district: p.district,
                city: p.city,
                projectType: p.projectType,
                projectValue: p.projectValue,
                status: p.status,
                completionPercent: p.completionPercent,
                milestonesCount: p._count.milestones,
                totalAllocated,
                totalConsumed,
                totalRemaining: totalAllocated - totalConsumed,
                projectManager: p.projectManager,
                startDate: p.startDate,
                endDate: p.endDate,
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
                state: true,
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

        const totalAllocated = project.materialPlans.reduce((sum, mp) => sum + mp.plannedQuantity, 0);
        const totalConsumed = project.materialPlans.reduce((sum, mp) => sum + mp.consumedQuantity, 0);

        res.json({
            ...project,
            totalAllocated,
            totalConsumed,
            totalRemaining: totalAllocated - totalConsumed,
        });
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
        // Validate customer and state belong to tenant
        const customer = await prisma.customer.findFirst({ where: { id: data.customerId, tenantId } });
        if (!customer) return res.status(400).json({ message: 'Customer not found or not accessible' });

        if (data.stateId) {
            const state = await prisma.state.findFirst({ where: { id: data.stateId, tenantId } });
            if (!state) return res.status(400).json({ message: 'State not found' });
        }

        if (data.projectManagerId) {
            const user = await prisma.user.findFirst({ where: { id: data.projectManagerId, tenantId } });
            if (!user) return res.status(400).json({ message: 'Project manager not found' });
        }

        const project = await prisma.project.create({
            data: {
                tenantId,
                name: data.name,
                code: data.code,
                customerId: data.customerId,
                stateId: data.stateId || null,
                district: data.district,
                city: data.city,
                siteAddress: data.siteAddress,
                projectType: data.projectType,
                projectValue: data.projectValue,
                startDate: data.startDate ? new Date(data.startDate) : undefined,
                endDate: data.endDate ? new Date(data.endDate) : undefined,
                completionPercent: data.completionPercent ?? 0,
                status: data.status || 'NOT_STARTED',
                projectManagerId: data.projectManagerId,
            },
            include: {
                customer: true,
                state: true,
                projectManager: { select: { id: true, name: true } },
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
        const id = parseInt(req.params.id);
        const project = await prisma.project.findFirst({ where: { id, tenantId } });
        if (!project) return res.status(404).json({ message: 'Project not found' });

        const validation = projectSchema.partial().safeParse(req.body);
        if (!validation.success) {
            return res.status(400).json({ message: 'Validation error', errors: validation.error.issues });
        }
        const data = validation.data;

        if (data.customerId) {
            const customer = await prisma.customer.findFirst({ where: { id: data.customerId, tenantId } });
            if (!customer) return res.status(400).json({ message: 'Customer not found' });
        }
        if (data.stateId) {
            const state = await prisma.state.findFirst({ where: { id: data.stateId, tenantId } });
            if (!state) return res.status(400).json({ message: 'State not found' });
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
            include: {
                customer: true,
                state: true,
                projectManager: { select: { id: true, name: true } },
            },
        });

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
export const getProjectStock = async (req: any, res: any) => {
    try {
        const tenantId = req.user.tenantId;
        const projectId = parseInt(req.params.id);
        const project = await prisma.project.findFirst({ where: { id: projectId, tenantId } });
        if (!project) return res.status(404).json({ message: 'Project not found' });

        const stockItems = await prisma.projectStock.findMany({
            where: { projectId },
            include: {
                product: {
                    include: {
                        brands: {
                            include: { brand: { select: { id: true, name: true } } }
                        },
                        serviceCategory: true,
                    }
                }
            },
        });

        const result = stockItems.map(item => ({
            productId: item.productId,
            productName: item.product.name,
            productCode: item.product.productCode,
            // Join all brand names
            brand: item.product.brands.map(pb => pb.brand.name).join(', ') || '-',
            category: item.product.serviceCategory?.name || '-',
            unit: item.product.unit,
            quantityOnSite: item.quantityOnSite,
            reservedQuantity: item.reservedQuantity,
            available: item.quantityOnSite - item.reservedQuantity,
        }));

        res.json(result);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Failed to fetch project stock' });
    }
};

// Get consumption history (stock movements FROM this project, e.g., material used)
export const getProjectConsumption = async (req: any, res: any) => {
    try {
        const tenantId = req.user.tenantId;
        const projectId = parseInt(req.params.id);
        const project = await prisma.project.findFirst({ where: { id: projectId, tenantId } });
        if (!project) return res.status(404).json({ message: 'Project not found' });

        // Fetch ProjectStockMovement records where type = 'STOCK_OUT' and projectId = this project
        // (meaning material taken out of project – consumption)
        const movements = await prisma.projectStockMovement.findMany({
            where: { projectId, type: 'STOCK_OUT' },
            include: {
                product: { select: { id: true, name: true, productCode: true, unit: true } },
                user: { select: { id: true, name: true } },
            },
            orderBy: { date: 'desc' },
        });
        res.json(movements);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Failed to fetch consumption history' });
    }
};

// Get incoming deliveries (stock movements TO this project from office or vendor)
export const getProjectIncoming = async (req: any, res: any) => {
    try {
        const tenantId = req.user.tenantId;
        const projectId = parseInt(req.params.id);
        const project = await prisma.project.findFirst({ where: { id: projectId, tenantId } });
        if (!project) return res.status(404).json({ message: 'Project not found' });

        // Two sources: StockMovement (toProjectId) and ProjectStockMovement (type='STOCK_IN')
        const [officeTransfers, directDeliveries] = await Promise.all([
            prisma.stockMovement.findMany({
                where: { toProjectId: projectId, tenantId },
                include: {
                    product: { select: { id: true, name: true, productCode: true, unit: true } },
                    fromVendor: { select: { id: true, name: true } },
                    user: { select: { id: true, name: true } },
                },
                orderBy: { date: 'desc' },
            }),
            prisma.projectStockMovement.findMany({
                where: { projectId, type: 'STOCK_IN' },
                include: {
                    product: { select: { id: true, name: true, productCode: true, unit: true } },
                    user: { select: { id: true, name: true } },
                },
                orderBy: { date: 'desc' },
            }),
        ]);

        // Combine and sort by date
        const all = [
            ...officeTransfers.map(m => ({
                id: m.id,
                date: m.date,
                productName: m.product.name,
                productCode: m.product.productCode,
                quantity: m.quantity,
                unit: m.product.unit,
                source: m.fromVendor ? `Vendor: ${m.fromVendor.name}` : 'Office Transfer',
                notes: m.notes,
                status: 'Delivered', // all recorded movements are completed
            })),
            ...directDeliveries.map(m => ({
                id: m.id,
                date: m.date,
                productName: m.product.name,
                productCode: m.product.productCode,
                quantity: m.quantity,
                unit: m.product.unit,
                source: m.notes || 'Direct Site Delivery',
                notes: m.notes,
                status: 'Delivered',
            })),
        ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

        res.json(all);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Failed to fetch incoming deliveries' });
    }
};

async function recalcProjectProgress(projectId: number) {
    const milestones = await prisma.projectMilestone.findMany({
        where: { projectId },
        select: { progress: true },
    });
    const count = milestones.length;
    const avg = count === 0 ? 0 : milestones.reduce((sum, m) => sum + m.progress, 0) / count;
    await prisma.project.update({
        where: { id: projectId },
        data: { overallProgress: Math.round(avg * 100) / 100 },
    });
}