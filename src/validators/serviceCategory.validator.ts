import { z } from 'zod';
export const serviceCategorySchema = z.object({
    name: z.string().min(1).max(100),
    description: z.string().max(1000).optional(),
});