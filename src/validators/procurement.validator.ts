import { z } from 'zod';

export const purchaseRequestItemSchema = z.object({
    productId: z.number().int().positive(),
    quantity: z.number().int().positive(),
    estimatedPrice: z.number().nonnegative().optional(),
});

export const purchaseRequestSchema = z.object({
    dateRequired: z.string().datetime().optional().or(z.literal('')),
    notes: z.string().max(1000).optional(),
    items: z.array(purchaseRequestItemSchema).min(1, 'At least one item required'),
});

export const purchaseOrderItemSchema = z.object({
    productId: z.number().int().positive(),
    quantity: z.number().int().positive(),
    unitPrice: z.number().nonnegative(),
});

export const purchaseOrderSchema = z.object({
    vendorId: z.number().int().positive(),
    projectId: z.number().int().positive().optional(),
    expectedDeliveryDate: z.string().datetime().optional().or(z.literal('')),
    notes: z.string().max(1000).optional(),
    items: z.array(purchaseOrderItemSchema).min(1, 'At least one item required'),
});