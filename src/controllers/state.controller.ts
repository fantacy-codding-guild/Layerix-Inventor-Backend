import prisma from '../lib/prisma';

export const getStates = async (req: any, res: any) => {
    try {
        const tenantId = req.user.tenantId;
        const states = await prisma.state.findMany({
            where: { tenantId },
            include: { _count: { select: { projects: true } } },
            orderBy: { name: 'asc' },
        });
        res.json(states);
    } catch (error) {
        res.status(500).json({ message: 'Failed to fetch states' });
    }
};

export const createState = async (req: any, res: any) => {
    try {
        const tenantId = req.user.tenantId;
        const { name, code, region } = req.body;
        if (!name || !code) return res.status(400).json({ message: 'Name and code are required' });
        const state = await prisma.state.create({
            data: { tenantId, name, code, region },
        });
        res.status(201).json(state);
    } catch (error: any) {
        if (error.code === 'P2002') return res.status(400).json({ message: 'State name or code already exists' });
        res.status(500).json({ message: 'Failed to create state' });
    }
};

export const updateState = async (req: any, res: any) => {
    try {
        const tenantId = req.user.tenantId;
        const id = parseInt(req.params.id);
        const { name, code, region } = req.body;
        const state = await prisma.state.findFirst({ where: { id, tenantId } });
        if (!state) return res.status(404).json({ message: 'State not found' });
        const updated = await prisma.state.update({
            where: { id },
            data: { name, code, region },
        });
        res.json(updated);
    } catch (error) {
        res.status(500).json({ message: 'Failed to update state' });
    }
};

export const deleteState = async (req: any, res: any) => {
    try {
        const tenantId = req.user.tenantId;
        const id = parseInt(req.params.id);
        const state = await prisma.state.findFirst({ where: { id, tenantId } });
        if (!state) return res.status(404).json({ message: 'State not found' });
        await prisma.state.delete({ where: { id } });
        res.json({ message: 'State deleted' });
    } catch (error) {
        res.status(500).json({ message: 'Failed to delete state' });
    }
};