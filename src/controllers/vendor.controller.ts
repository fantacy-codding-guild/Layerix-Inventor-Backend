//backend\src\controllers\vendor.controller.ts
import prisma from '../lib/prisma';
import { z } from 'zod';

// ---------- Validation Schemas ----------
const vendorSchema = z.object({
    name: z.string().min(1, 'Company name is required'),
    gstNumber: z.string().optional(),
    website: z.string().url().optional().or(z.literal('')),
});

const contactSchema = z.object({
    name: z.string().min(1, 'Contact name required'),
    phone: z.string().optional(),
    altPhone: z.string().optional(),
    email: z.string().email().optional().or(z.literal('')),
    isPrimary: z.boolean().default(false),
});

// ---------- Vendor CRUD ----------
export const getVendors = async (req: any, res: any) => {
    try {
        const tenantId = req.user.tenantId;
        const { search, page = 1, limit = 20 } = req.query;
        const skip = (Number(page) - 1) * Number(limit);
        const where: any = { tenantId };
        if (search) {
            where.OR = [
                { name: { contains: search, mode: 'insensitive' } },
                { gstNumber: { contains: search, mode: 'insensitive' } },
            ];
        }
        const [vendors, total] = await Promise.all([
            prisma.vendor.findMany({
                where,
                include: { contacts: true },
                orderBy: { name: 'asc' },
                skip,
                take: Number(limit),
            }),
            prisma.vendor.count({ where }),
        ]);
        res.json({
            data: vendors,
            pagination: { page: Number(page), limit: Number(limit), total, totalPages: Math.ceil(total / Number(limit)) },
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Failed to fetch vendors' });
    }
};

export const getVendor = async (req: any, res: any) => {
    try {
        const vendor = await prisma.vendor.findFirst({
            where: { id: parseInt(req.params.id), tenantId: req.user.tenantId },
            include: { contacts: true },
        });
        if (!vendor) return res.status(404).json({ message: 'Vendor not found' });
        res.json(vendor);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Failed to fetch vendor' });
    }
};

export const createVendor = async (req: any, res: any) => {
    try {
        const tenantId = req.user.tenantId;
        const validation = vendorSchema.safeParse(req.body);
        if (!validation.success) {
            return res.status(400).json({ message: 'Validation error', errors: validation.error.issues });
        }
        const vendor = await prisma.vendor.create({
            data: { tenantId, ...validation.data },
        });
        res.status(201).json(vendor);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Failed to create vendor' });
    }
};

export const updateVendor = async (req: any, res: any) => {
    try {
        const tenantId = req.user.tenantId;
        const id = parseInt(req.params.id);
        const exists = await prisma.vendor.findFirst({ where: { id, tenantId } });
        if (!exists) return res.status(404).json({ message: 'Vendor not found' });
        const validation = vendorSchema.safeParse(req.body);
        if (!validation.success) {
            return res.status(400).json({ message: 'Validation error', errors: validation.error.issues });
        }
        const updated = await prisma.vendor.update({
            where: { id },
            data: validation.data,
        });
        res.json(updated);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Failed to update vendor' });
    }
};

export const deleteVendor = async (req: any, res: any) => {
    try {
        const tenantId = req.user.tenantId;
        const id = parseInt(req.params.id);
        const vendor = await prisma.vendor.findFirst({ where: { id, tenantId } });
        if (!vendor) return res.status(404).json({ message: 'Vendor not found' });
        // Check if vendor has purchase orders
        const poCount = await prisma.purchaseOrder.count({ where: { vendorId: id } });
        if (poCount > 0) {
            return res.status(409).json({ message: 'Cannot delete vendor with existing purchase orders.' });
        }
        await prisma.vendor.delete({ where: { id } });
        res.json({ message: 'Vendor deleted' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Failed to delete vendor' });
    }
};

// ---------- Vendor Contacts ----------
export const getVendorContacts = async (req: any, res: any) => {
    try {
        const vendorId = parseInt(req.params.id);
        const tenantId = req.user.tenantId;
        const vendor = await prisma.vendor.findFirst({ where: { id: vendorId, tenantId } });
        if (!vendor) return res.status(404).json({ message: 'Vendor not found' });
        const contacts = await prisma.vendorContact.findMany({ where: { vendorId } });
        res.json(contacts);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Failed to fetch contacts' });
    }
};

export const addVendorContact = async (req: any, res: any) => {
    try {
        const vendorId = parseInt(req.params.id);
        const tenantId = req.user.tenantId;
        const vendor = await prisma.vendor.findFirst({ where: { id: vendorId, tenantId } });
        if (!vendor) return res.status(404).json({ message: 'Vendor not found' });
        const validation = contactSchema.safeParse(req.body);
        if (!validation.success) {
            return res.status(400).json({ message: 'Validation error', errors: validation.error.issues });
        }
        const contact = await prisma.vendorContact.create({
            data: { vendorId, ...validation.data }
        });
        if (contact.isPrimary) {
            await prisma.vendorContact.updateMany({
                where: { vendorId, id: { not: contact.id } },
                data: { isPrimary: false }
            });
        }
        res.status(201).json(contact);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Failed to add contact' });
    }
};

export const updateVendorContact = async (req: any, res: any) => {
    try {
        const contactId = parseInt(req.params.contactId);
        const vendorId = parseInt(req.params.id);
        const tenantId = req.user.tenantId;
        const vendor = await prisma.vendor.findFirst({ where: { id: vendorId, tenantId } });
        if (!vendor) return res.status(404).json({ message: 'Vendor not found' });
        const validation = contactSchema.partial().safeParse(req.body);
        if (!validation.success) {
            return res.status(400).json({ message: 'Validation error', errors: validation.error.issues });
        }
        const updated = await prisma.vendorContact.update({
            where: { id: contactId },
            data: validation.data,
        });
        if (updated.isPrimary) {
            await prisma.vendorContact.updateMany({
                where: { vendorId, id: { not: contactId } },
                data: { isPrimary: false }
            });
        }
        res.json(updated);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Failed to update contact' });
    }
};

export const deleteVendorContact = async (req: any, res: any) => {
    try {
        const contactId = parseInt(req.params.contactId);   // ← from URL
        const vendorId = parseInt(req.params.id);
        const tenantId = req.user.tenantId;

        const vendor = await prisma.vendor.findFirst({ where: { id: vendorId, tenantId } });
        if (!vendor) return res.status(404).json({ message: 'Vendor not found' });

        await prisma.vendorContact.delete({
            where: { id: contactId }   // ← use the correct ID
        });
        res.json({ message: 'Contact deleted' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Failed to delete contact' });
    }
};

export const deleteAllVendorContacts = async (req: any, res: any) => {
    try {
        const vendorId = parseInt(req.params.id);
        const tenantId = req.user.tenantId;
        const vendor = await prisma.vendor.findFirst({ where: { id: vendorId, tenantId } });
        if (!vendor) return res.status(404).json({ message: 'Vendor not found' });
        await prisma.vendorContact.deleteMany({ where: { vendorId } });
        res.json({ message: 'All contacts deleted' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Failed to delete contacts' });
    }
};