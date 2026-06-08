import prisma from '../lib/prisma';

// GET /api/users/me – current logged-in user
export const getMe = async (req: any, res: any) => {
    try {
        const user = await prisma.user.findUnique({
            where: { id: req.user.userId },
            include: { role: true, tenant: true },
        });
        if (!user) return res.status(404).json({ message: 'User not found' });
        const { passwordHash, otpCode, otpExpiry, ...rest } = user;
        res.json(rest);
    } catch (error) {
        res.status(500).json({ message: 'Failed to fetch user' });
    }
};

// GET /api/users – admin only – list all users in the tenant
export const getUsers = async (req: any, res: any) => {
    try {
        // We'll check role in middleware, but double-check here
        if (req.user.role !== 'admin') {
            // Allow admin role name or role id check; we'll assume role name stored in token
            return res.status(403).json({ message: 'Admin access required' });
        }

        const users = await prisma.user.findMany({
            where: { tenantId: req.user.tenantId },
            include: { role: { select: { id: true, name: true } } },
            orderBy: { name: 'asc' },
        });

        // Remove sensitive fields
        const data = users.map(({ passwordHash, otpCode, otpExpiry, ...u }) => u);
        res.json(data);
    } catch (error) {
        res.status(500).json({ message: 'Failed to fetch users' });
    }
};

// PUT /api/users/:id – admin only – update user role or active status
export const updateUser = async (req: any, res: any) => {
    try {
        if (req.user.role !== 'admin') return res.status(403).json({ message: 'Admin access required' });

        const targetId = parseInt(req.params.id);
        const { roleId, isActive } = req.body;

        const user = await prisma.user.findFirst({
            where: { id: targetId, tenantId: req.user.tenantId },
        });
        if (!user) return res.status(404).json({ message: 'User not found' });

        // Prevent admin from changing their own role? (optional)
        if (targetId === req.user.userId && roleId && roleId !== user.roleId) {
            return res.status(400).json({ message: 'Cannot change your own role' });
        }

        const updated = await prisma.user.update({
            where: { id: targetId },
            data: {
                roleId: roleId || undefined,
                isActive: isActive !== undefined ? isActive : undefined,
            },
            include: { role: { select: { id: true, name: true } } },
        });

        const { passwordHash, otpCode, otpExpiry, ...rest } = updated;
        res.json(rest);
    } catch (error) {
        res.status(500).json({ message: 'Failed to update user' });
    }
};

// GET /api/roles – list roles available in the tenant
export const getRoles = async (req: any, res: any) => {
    try {
        const roles = await prisma.role.findMany({
            where: { tenantId: req.user.tenantId },
            orderBy: { name: 'asc' },
        });
        res.json(roles);
    } catch (error) {
        res.status(500).json({ message: 'Failed to fetch roles' });
    }
};