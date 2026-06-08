import prisma from '../lib/prisma';
import { serviceTicketSchema } from '../validators/serviceTicket.validator';
import { z } from 'zod';

// GET /api/service-tickets
export const getServiceTickets = async (req: any, res: any) => {
    try {
        const tenantId = req.user.tenantId;
        const { customerId, priority, status, assignedTo, page = 1, limit = 20 } = req.query;
        const where: any = { tenantId };
        if (customerId) where.customerId = Number(customerId);
        if (priority) where.priority = priority.toUpperCase();
        if (status) {
            const statuses = String(status).split(',').map(s => s.trim().toUpperCase());
            where.status = { in: statuses };
        } if (assignedTo) where.assignedTo = Number(assignedTo);

        const [tickets, total] = await Promise.all([
            prisma.serviceTicket.findMany({
                where,
                include: {
                    customer: { select: { id: true, name: true } },
                    assignee: { select: { id: true, name: true } },
                    project: { select: { id: true, name: true } },
                },
                orderBy: { createdAt: 'desc' },
                skip: (Number(page) - 1) * Number(limit),
                take: Number(limit),
            }),
            prisma.serviceTicket.count({ where }),
        ]);

        res.json({
            data: tickets,
            pagination: {
                page: Number(page),
                limit: Number(limit),
                total,
                totalPages: Math.ceil(total / Number(limit)),
            },
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Failed to fetch service tickets' });
    }
};

// GET /api/service-tickets/:id
export const getServiceTicket = async (req: any, res: any) => {
    try {
        const ticket = await prisma.serviceTicket.findFirst({
            where: { id: parseInt(req.params.id), tenantId: req.user.tenantId },
            include: {
                customer: true,
                assignee: { select: { id: true, name: true } },
                project: { select: { id: true, name: true } },
                siteVisits: true,
            },
        });
        if (!ticket) return res.status(404).json({ message: 'Ticket not found' });
        res.json(ticket);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Failed to fetch ticket' });
    }
};

// POST /api/service-tickets
export const createServiceTicket = async (req: any, res: any) => {
    try {
        const tenantId = req.user.tenantId;
        const validation = serviceTicketSchema.safeParse(req.body);
        if (!validation.success) {
            return res.status(400).json({ message: 'Validation error', errors: validation.error.issues });
        }

        const data = validation.data;

        // Validate customer
        const customer = await prisma.customer.findFirst({ where: { id: data.customerId, tenantId } });
        if (!customer) return res.status(400).json({ message: 'Customer not found' });

        if (data.projectId) {
            const project = await prisma.project.findFirst({ where: { id: data.projectId, tenantId } });
            if (!project) return res.status(400).json({ message: 'Project not found' });
        }
        if (data.assignedTo) {
            const user = await prisma.user.findFirst({ where: { id: data.assignedTo, tenantId } });
            if (!user) return res.status(400).json({ message: 'User not found' });
        }

        // Generate ticket number
        const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
        const count = await prisma.serviceTicket.count({ where: { tenantId } });
        const ticketNumber = `TKT-${today}-${String(count + 1).padStart(3, '0')}`;

        const ticket = await prisma.serviceTicket.create({
            data: {
                tenantId,
                ticketNumber,
                ...data,
            },
            include: {
                customer: { select: { id: true, name: true } },
                assignee: { select: { id: true, name: true } },
            },
        });

        // Log activity
        await prisma.activityLog.create({
            data: {
                tenantId,
                userId: req.user.userId,
                action: 'CREATE',
                entityType: 'ServiceTicket',
                entityId: ticket.id,
                details: { ticketNumber },
            },
        });

        res.status(201).json(ticket);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Failed to create ticket' });
    }
};

// PUT /api/service-tickets/:id
export const updateServiceTicket = async (req: any, res: any) => {
    try {
        const tenantId = req.user.tenantId;
        const id = parseInt(req.params.id);
        const ticket = await prisma.serviceTicket.findFirst({ where: { id, tenantId } });
        if (!ticket) return res.status(404).json({ message: 'Ticket not found' });

        // Allow partial updates
        const validation = serviceTicketSchema.partial().extend({
            status: z.enum(['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED']).optional(),
        }).safeParse(req.body);

        if (!validation.success) {
            return res.status(400).json({ message: 'Validation error', errors: validation.error.issues });
        }

        const updated = await prisma.serviceTicket.update({
            where: { id },
            data: validation.data,
            include: { customer: { select: { id: true, name: true } }, assignee: { select: { id: true, name: true } } },
        });

        // Log activity
        await prisma.activityLog.create({
            data: {
                tenantId,
                userId: req.user.userId,
                action: 'UPDATE',
                entityType: 'ServiceTicket',
                entityId: id,
                details: { changes: validation.data },
            },
        });

        res.json(updated);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Failed to update ticket' });
    }
};

// DELETE /api/service-tickets/:id
export const deleteServiceTicket = async (req: any, res: any) => {
    try {
        const tenantId = req.user.tenantId;
        const id = parseInt(req.params.id);
        const ticket = await prisma.serviceTicket.findFirst({ where: { id, tenantId } });
        if (!ticket) return res.status(404).json({ message: 'Ticket not found' });

        await prisma.serviceTicket.delete({ where: { id } });
        res.json({ message: 'Ticket deleted' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Failed to delete ticket' });
    }
};