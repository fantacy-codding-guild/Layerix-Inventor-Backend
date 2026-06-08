import { z } from 'zod';

export const serviceTicketSchema = z.object({
    customerId: z.number().int().positive(),
    contactPerson: z.string().max(100).optional(),
    issueType: z.string().max(100).optional(),   // e.g., Network, CCTV, Server
    description: z.string().min(1, 'Description required').max(2000),
    priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).default('MEDIUM'),
    assignedTo: z.number().int().positive().optional(),   // user ID
    projectId: z.number().int().positive().optional(),
    siteVisitRequired: z.boolean().default(false),
});