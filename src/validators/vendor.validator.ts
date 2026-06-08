//backend\src\validators\vendor.validator.ts
import { z } from 'zod';

export const vendorSchema = z.object({
    name: z.string().min(1, 'Vendor name is required').max(200),
    companyName: z.string().max(200).optional(),
    gstNumber: z.string().max(50).optional(),
    phone: z.string().max(20).optional(),
    email: z.string().email('Invalid email').optional().or(z.literal('')),
    address: z.string().max(500).optional(),
    city: z.string().max(100).optional(),
    state: z.string().max(100).optional(),
    country: z.string().max(100).optional(),
    website: z.string().max(200).optional(),
    notes: z.string().max(2000).optional(),
});

export const vendorProductMappingSchema = z.object({
    productId: z.number().int().positive().optional(),
    name: z.string().min(1).max(200).optional(),
    brandId: z.number().int().positive().nullable().optional(),
    newBrandName: z.string().max(100).optional(),
    modelNumber: z.string().max(100).optional(),
    unit: z.string().max(20).optional(),
    description: z.string().max(1000).optional(),
    unitPrice: z.number().nonnegative().optional(),
    leadTimeDays: z.number().int().nonnegative().optional(),
    isPreferred: z.boolean().default(false).optional(),
});