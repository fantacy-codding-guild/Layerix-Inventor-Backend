import { z } from 'zod';

export const stockInSchema = z.object({
    productId: z.number().int().positive(),
    quantity: z.number().int().positive(),
    unitPrice: z.number().nonnegative().optional(),
    fromVendorId: z.number().int().positive().optional(),
    projectId: z.number().int().positive().optional(),   // project for which we're buying
    referenceType: z.enum(['PURCHASE_ORDER', 'MANUAL_ADJUSTMENT', 'RETURN']).optional(),
    referenceId: z.number().int().positive().optional(),
    notes: z.string().max(500).optional(),
});

export const stockOutSchema = z.object({
    productId: z.number().int().positive(),
    quantity: z.number().int().positive(),
    unitPrice: z.number().nonnegative().optional(),       // cost or selling price
    toProjectId: z.number().int().positive().optional(),   // issued to project
    toCustomerId: z.number().int().positive().optional(),  // sold directly to customer
    referenceType: z.enum(['PROJECT', 'MANUAL_ADJUSTMENT', 'RETURN']).optional(),
    referenceId: z.number().int().positive().optional(),
    notes: z.string().max(500).optional(),
});

export const adjustmentSchema = z.object({
    productId: z.number().int().positive(),
    quantity: z.number().int(),
    notes: z.string().max(500).optional(),
});

export const reservationSchema = z.object({
    productId: z.number().int().positive(),
    projectId: z.number().int().positive(),
    quantity: z.number().int().positive(),
});