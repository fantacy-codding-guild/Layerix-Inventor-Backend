import prisma from '../lib/prisma';
import { z } from 'zod';

// ─── Validation ────────────────────────────────────────────────
const stateSchema = z.object({
    name: z.string().min(1, 'Name is required').max(100),
    code: z.string().min(1, 'Code is required').max(10),
    region: z.string().optional(),
});

export const getStates = async (req: any, res: any) => {
    try {
        const states = await prisma.state.findMany({
            where: { tenantId: req.user.tenantId },
            include: { _count: { select: { projects: true } } },
            orderBy: { name: 'asc' },
        });
        res.json(states);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Failed to fetch states' });
    }
};

export const createState = async (req: any, res: any) => {
    try {
        const validation = stateSchema.safeParse(req.body);
        if (!validation.success) {
            return res.status(400).json({ message: 'Validation error', errors: validation.error.issues });
        }
        const tenantId = req.user.tenantId;

        const exists = await prisma.state.findFirst({
            where: { tenantId, OR: [{ name: validation.data.name }, { code: validation.data.code }] },
        });
        if (exists) return res.status(409).json({ message: 'State name or code already exists' });

        const state = await prisma.state.create({ data: { tenantId, ...validation.data } });
        res.status(201).json(state);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Failed to create state' });
    }
};

export const updateState = async (req: any, res: any) => {
    try {
        const id = parseInt(req.params.id);
        const tenantId = req.user.tenantId;

        const existing = await prisma.state.findFirst({ where: { id, tenantId } });
        if (!existing) return res.status(404).json({ message: 'State not found' });

        const validation = stateSchema.safeParse(req.body);
        if (!validation.success) {
            return res.status(400).json({ message: 'Validation error', errors: validation.error.issues });
        }

        // Check uniqueness excluding self
        const duplicate = await prisma.state.findFirst({
            where: {
                tenantId,
                OR: [{ name: validation.data.name }, { code: validation.data.code }],
                NOT: { id },
            },
        });
        if (duplicate) return res.status(409).json({ message: 'Another state with this name or code exists' });

        const updated = await prisma.state.update({ where: { id }, data: validation.data });
        res.json(updated);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Failed to update state' });
    }
};

export const deleteState = async (req: any, res: any) => {
    try {
        const id = parseInt(req.params.id);
        const tenantId = req.user.tenantId;

        const state = await prisma.state.findFirst({ where: { id, tenantId } });
        if (!state) return res.status(404).json({ message: 'State not found' });

        // Optional: check if projects are linked; allow deletion anyway (frontend says projects lose state)
        await prisma.state.delete({ where: { id } });
        res.json({ message: 'State deleted' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Failed to delete state' });
    }
};