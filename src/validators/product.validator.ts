//backend\src\validators\product.validator.ts
import { z } from 'zod';

export const createProductSchema = z.object({
    name: z.string().min(1, 'Name is required').max(200),
    modelNumber: z.string().max(100).optional(),
    unit: z.string().max(20).default('Pcs').optional(),
    description: z.string().max(1000).optional(),
});

export const updateProductSchema = createProductSchema.partial();