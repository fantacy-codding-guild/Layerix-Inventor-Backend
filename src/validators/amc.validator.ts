import { z } from 'zod';

export const amcSchema = z.object({
    customerId: z.number().int().positive(),
    projectId: z.number().int().positive().optional(),
    contractNumber: z.string().min(1).max(100),
    startDate: z.string().datetime(),
    endDate: z.string().datetime(),
    serviceType: z.string().max(100),   // Preventive, Comprehensive, etc.
    frequency: z.string().max(50).optional(),  // Monthly, Quarterly
    amount: z.number().nonnegative().optional(),
    status: z.enum(['ACTIVE', 'EXPIRED', 'CANCELLED']).default('ACTIVE'),
    notes: z.string().max(2000).optional(),
});