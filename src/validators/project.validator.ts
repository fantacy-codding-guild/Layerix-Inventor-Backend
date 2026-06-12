import { z } from 'zod';



export const milestoneSchema = z.object({
    name: z.string().min(1).max(200),
    description: z.string().max(1000).optional(),
    startDate: z.string().datetime().optional().or(z.literal('')),
    endDate: z.string().datetime().optional().or(z.literal('')),
    progress: z.number().min(0).max(100).optional(),
    status: z.enum(['NOT_STARTED', 'IN_PROGRESS', 'COMPLETED', 'ON_HOLD', 'CANCELLED']).optional(),
    orderIndex: z.number().int().min(0).optional(),
});

export const materialPlanSchema = z.object({
    productId: z.number().int().positive(),
    plannedQuantity: z.number().int().positive(),
});

export const projectSchema = z.object({
    name: z.string().min(1, 'Project name is required').max(300),
    code: z.string().max(50).optional(),
    customerId: z.number().int().positive('Customer is required'),
    stateId: z.number().int().positive().optional(),
    district: z.string().max(100).optional(),
    city: z.string().max(100).optional(),
    siteAddress: z.string().max(500).optional(),
    projectType: z.string().max(100).optional(),
    projectValue: z.number().nonnegative().optional(),
    startDate: z.string().datetime().optional().or(z.literal('')),
    endDate: z.string().datetime().optional().or(z.literal('')),
    completionPercent: z.number().min(0).max(100).optional(),
    status: z.enum(['NOT_STARTED', 'IN_PROGRESS', 'COMPLETED', 'ON_HOLD', 'CANCELLED']).optional(),
    projectManagerId: z.number().int().positive().optional(),
});