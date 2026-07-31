// backend/src/validators/inventory.validator.ts
import { z } from 'zod';
import { ReferenceType } from '@prisma/client';

export const stockInSchema = z.object({
    productId: z.number().int().positive(),
    quantity: z.number().int().positive(),
    unitPrice: z.number().positive().optional(),
    fromVendorId: z.number().int().positive().optional(),
    projectId: z.number().int().positive().optional(),
    referenceType: z.nativeEnum(ReferenceType).optional(),
    referenceId: z.number().int().optional(),
    notes: z.string().optional(),
    unit: z.string().min(1, 'Unit is required'), // ✅ added
});

export const stockOutSchema = z.object({
    productId: z.number().int().positive(),
    quantity: z.number().int().positive(),
    unitPrice: z.number().positive().optional(),
    toProjectId: z.number().int().positive().optional(),
    toCustomerId: z.number().int().positive().optional(),
    referenceType: z.nativeEnum(ReferenceType).optional(),
    referenceId: z.number().int().optional(),
    notes: z.string().optional(),

    brand: z.string().min(1, 'Brand is required'),
    unit: z.string().min(1, 'Unit is required'),
    vendorId: z.number().int().positive().optional().nullable(),
});