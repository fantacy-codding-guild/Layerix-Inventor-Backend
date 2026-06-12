import { z } from 'zod';

export const createProductSchema = z.object({
    name: z.string().min(1, 'Name is required').max(200),
    brandIds: z.array(z.number().int().positive()).optional(),   // multiple brands
    modelNumber: z.string().max(100).optional(),
    unit: z.string().max(20).default('Pcs').optional(),
    description: z.string().max(1000).optional(),
    // Vendor linkage (optional)
    vendorId: z.number().int().positive().optional(),
    unitPrice: z.number().nonnegative().optional(),
    leadTimeDays: z.number().int().nonnegative().optional(),
    isPreferred: z.boolean().default(false).optional(),
});

export const updateProductSchema = z.object({
    name: z.string().min(1).max(200).optional(),
    brandIds: z.array(z.number().int().positive()).optional(),
    modelNumber: z.string().max(100).optional(),
    unit: z.string().max(20).optional(),
    description: z.string().max(1000).optional(),
    vendorId: z.number().int().positive().optional(),
    unitPrice: z.number().nonnegative().optional(),
    leadTimeDays: z.number().int().nonnegative().optional(),
    isPreferred: z.boolean().default(false).optional(),
});