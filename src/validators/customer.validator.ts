import { z } from 'zod';

export const customerSchema = z.object({
    name: z.string().min(1, 'Customer name is required').max(200),
    company: z.string().max(200).optional(),
    phone: z.string().max(20).optional(),
    email: z.string().email('Invalid email').optional().or(z.literal('')),
    gstNumber: z.string().max(50).optional(),
    address: z.string().max(500).optional(),
    city: z.string().max(100).optional(),
    state: z.string().max(100).optional(),
    country: z.string().max(100).optional(),
    notes: z.string().max(2000).optional(),
});