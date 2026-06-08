import prisma from '../lib/prisma';
import { customerSchema } from '../validators/customer.validator';

// GET /api/customers
export const getCustomers = async (req: any, res: any) => {
    try {
        const tenantId = req.user.tenantId;
        const { search, page = 1, limit = 20, sortBy = 'name', sortOrder = 'asc' } = req.query;
        const skip = (Number(page) - 1) * Number(limit);
        const where: any = { tenantId };

        if (search) {
            where.OR = [
                { name: { contains: search, mode: 'insensitive' } },
                { company: { contains: search, mode: 'insensitive' } },
                { email: { contains: search, mode: 'insensitive' } },
                { city: { contains: search, mode: 'insensitive' } },
            ];
        }

        const [customers, total] = await Promise.all([
            prisma.customer.findMany({
                where,
                orderBy: { [sortBy as string]: sortOrder },
                skip,
                take: Number(limit),
            }),
            prisma.customer.count({ where }),
        ]);

        res.json({
            data: customers,
            pagination: {
                page: Number(page),
                limit: Number(limit),
                total,
                totalPages: Math.ceil(total / Number(limit)),
            },
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Failed to fetch customers' });
    }
};

// GET /api/customers/:id
export const getCustomer = async (req: any, res: any) => {
    try {
        const customer = await prisma.customer.findFirst({
            where: { id: parseInt(req.params.id), tenantId: req.user.tenantId },
        });
        if (!customer) return res.status(404).json({ message: 'Customer not found' });
        res.json(customer);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Failed to fetch customer' });
    }
};

// POST /api/customers
export const createCustomer = async (req: any, res: any) => {
    try {
        const tenantId = req.user.tenantId;
        const validation = customerSchema.safeParse(req.body);
        if (!validation.success) {
            return res.status(400).json({ message: 'Validation error', errors: validation.error.issues });
        }
        const customer = await prisma.customer.create({
            data: { ...validation.data, tenantId },
        });
        res.status(201).json(customer);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Failed to create customer' });
    }
};

// PUT /api/customers/:id
export const updateCustomer = async (req: any, res: any) => {
    try {
        const tenantId = req.user.tenantId;
        const id = parseInt(req.params.id);
        const exists = await prisma.customer.findFirst({ where: { id, tenantId } });
        if (!exists) return res.status(404).json({ message: 'Customer not found' });

        const validation = customerSchema.safeParse(req.body);
        if (!validation.success) {
            return res.status(400).json({ message: 'Validation error', errors: validation.error.issues });
        }

        const updated = await prisma.customer.update({
            where: { id },
            data: validation.data,
        });
        res.json(updated);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Failed to update customer' });
    }
};

// DELETE /api/customers/:id
export const deleteCustomer = async (req: any, res: any) => {
    try {
        const tenantId = req.user.tenantId;
        const id = parseInt(req.params.id);
        const customer = await prisma.customer.findFirst({ where: { id, tenantId } });
        if (!customer) return res.status(404).json({ message: 'Customer not found' });

        // Optional: check if customer has projects / tickets and prevent deletion, or allow
        await prisma.customer.delete({ where: { id } });
        res.json({ message: 'Customer deleted' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Failed to delete customer' });
    }
};