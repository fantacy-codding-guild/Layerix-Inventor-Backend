//backend\src\routes\setup.routes.ts
import { Router } from 'express';
import prisma from '../lib/prisma';

const router = Router();

router.get('/add-roles', async (req, res) => {
    try {
        const tenantId = 1; // your existing tenant ID
        await prisma.role.createMany({
            data: [
                { tenantId, name: 'manager', description: 'Manager' },
                { tenantId, name: 'team', description: 'Team member (read-only)' },
            ],
            skipDuplicates: true,
        });
        res.json({ message: 'Roles added successfully' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to add roles' });
    }
});

export default router;