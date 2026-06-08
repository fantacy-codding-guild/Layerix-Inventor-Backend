import prisma from '../lib/prisma';
import { amcSchema } from '../validators/amc.validator';
import { z } from 'zod';

export const getAMCs = async (req: any, res: any) => {
    try {
        const tenantId = req.user.tenantId;
        const { customerId, status, page = 1, limit = 20 } = req.query;
        const where: any = { tenantId };
        if (customerId) where.customerId = Number(customerId);
        if (status) where.status = status.toUpperCase();

        const [amcs, total] = await Promise.all([
            prisma.aMC.findMany({
                where,
                include: {
                    customer: { select: { id: true, name: true } },
                    project: { select: { id: true, name: true } },
                },
                orderBy: { createdAt: 'desc' },
                skip: (Number(page) - 1) * Number(limit),
                take: Number(limit),
            }),
            prisma.aMC.count({ where }),
        ]);

        res.json({ data: amcs, pagination: { page: Number(page), limit: Number(limit), total, totalPages: Math.ceil(total / Number(limit)) } });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Failed to fetch AMCs' });
    }
};

export const getAMC = async (req: any, res: any) => {
    try {
        const amc = await prisma.aMC.findFirst({
            where: { id: parseInt(req.params.id), tenantId: req.user.tenantId },
            include: { customer: true, project: true },
        });
        if (!amc) return res.status(404).json({ message: 'AMC not found' });
        res.json(amc);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Failed to fetch AMC' });
    }
};

export const createAMC = async (req: any, res: any) => {
    try {
        const tenantId = req.user.tenantId;
        const validation = amcSchema.safeParse(req.body);
        if (!validation.success) return res.status(400).json({ message: 'Validation error', errors: validation.error.issues });

        const data = validation.data;

        const customer = await prisma.customer.findFirst({ where: { id: data.customerId, tenantId } });
        if (!customer) return res.status(400).json({ message: 'Customer not found' });

        if (data.projectId) {
            const project = await prisma.project.findFirst({ where: { id: data.projectId, tenantId } });
            if (!project) return res.status(400).json({ message: 'Project not found' });
        }

        const amc = await prisma.aMC.create({
            data: {
                tenantId,
                ...data,
                startDate: new Date(data.startDate),
                endDate: new Date(data.endDate),
            },
            include: { customer: { select: { id: true, name: true } } },
        });

        res.status(201).json(amc);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Failed to create AMC' });
    }
};

export const updateAMC = async (req: any, res: any) => {
    try {
        const tenantId = req.user.tenantId;
        const id = parseInt(req.params.id);
        const amc = await prisma.aMC.findFirst({ where: { id, tenantId } });
        if (!amc) return res.status(404).json({ message: 'AMC not found' });

        const validation = amcSchema.partial().safeParse(req.body);
        if (!validation.success) return res.status(400).json({ message: 'Validation error', errors: validation.error.issues });

        const updated = await prisma.aMC.update({
            where: { id },
            data: {
                ...validation.data,
                startDate: validation.data.startDate ? new Date(validation.data.startDate) : undefined,
                endDate: validation.data.endDate ? new Date(validation.data.endDate) : undefined,
            },
        });
        res.json(updated);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Failed to update AMC' });
    }
};

export const deleteAMC = async (req: any, res: any) => {
    try {
        const tenantId = req.user.tenantId;
        const id = parseInt(req.params.id);
        const amc = await prisma.aMC.findFirst({ where: { id, tenantId } });
        if (!amc) return res.status(404).json({ message: 'AMC not found' });

        await prisma.aMC.delete({ where: { id } });
        res.json({ message: 'AMC deleted' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Failed to delete AMC' });
    }
};