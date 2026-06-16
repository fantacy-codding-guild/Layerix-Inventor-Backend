//backend\src\controllers\user.controller.ts
import prisma from '../lib/prisma';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';

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

export const createEmployee = async (req: any, res: any) => {
    try {
        const tenantId = req.user.tenantId;
        const { name, email, roleId } = req.body;

        if (!name || !email || !roleId) {
            return res.status(400).json({ message: 'Name, email, and role are required' });
        }

        // Check email uniqueness in this tenant
        const existing = await prisma.user.findFirst({ where: { tenantId, email } });
        if (existing) return res.status(409).json({ message: 'A user with this email already exists' });

        // Verify role belongs to tenant
        const role = await prisma.role.findFirst({ where: { id: parseInt(roleId), tenantId } });
        if (!role) return res.status(400).json({ message: 'Role not found' });

        // Generate temporary password
        const tempPassword = crypto.randomBytes(8).toString('hex'); // 16 chars
        const passwordHash = await bcrypt.hash(tempPassword, 12);

        const user = await prisma.user.create({
            data: {
                tenantId,
                name,
                email,
                passwordHash,
                roleId: parseInt(roleId),
                isActive: true,
                isVerified: true,           // skip OTP for admin-created users
                forcePasswordReset: true,   // force password change on first login
            },
            include: { role: { select: { id: true, name: true } } },
        });

        // Send credentials email (reuse sendOTPEmail or create a dedicated function)
        try {
            // We'll use the same OTP email function but with a custom message – but it sends "Your OTP is: ...".
            // Better: create a dedicated function sendCredentialsEmail, but for brevity we'll just log.
            // In production, implement an email template.
            console.log(`[EMPLOYEE CREATED] ${email} – temp password: ${tempPassword}`);
            // await sendCredentialsEmail(email, tempPassword);
        } catch (err) {
            console.error('Failed to send welcome email', err);
        }

        const { passwordHash: _, ...rest } = user;
        // Return temp password only for testing; remove in production
        res.status(201).json({ ...rest, tempPassword });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Failed to create employee' });
    }
};

// Add at the end of the file:

// DELETE /api/users/:id – admin only – delete user
export const deleteUser = async (req: any, res: any) => {
    try {
        if (req.user.role !== 'admin') return res.status(403).json({ message: 'Admin access required' });

        const targetId = parseInt(req.params.id);
        if (targetId === req.user.userId) {
            return res.status(400).json({ message: 'You cannot delete your own account' });
        }

        const user = await prisma.user.findFirst({
            where: { id: targetId, tenantId: req.user.tenantId },
        });
        if (!user) return res.status(404).json({ message: 'User not found' });

        // Check if user has any critical records (optional: soft delete instead)
        // For now we allow hard delete – cascade will delete refreshTokens, activityLogs
        await prisma.user.delete({ where: { id: targetId } });

        res.json({ message: 'User deleted successfully' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Failed to delete user' });
    }
};

// POST /api/users/:id/reset-password – admin only – reset user password
export const resetUserPassword = async (req: any, res: any) => {
    try {
        if (req.user.role !== 'admin') return res.status(403).json({ message: 'Admin access required' });

        const targetId = parseInt(req.params.id);
        const user = await prisma.user.findFirst({
            where: { id: targetId, tenantId: req.user.tenantId },
        });
        if (!user) return res.status(404).json({ message: 'User not found' });

        const tempPassword = crypto.randomBytes(8).toString('hex');
        const passwordHash = await bcrypt.hash(tempPassword, 12);

        await prisma.user.update({
            where: { id: targetId },
            data: {
                passwordHash,
                forcePasswordReset: true,
            },
        });

        // In production, send email with the temp password
        console.log(`[PASSWORD RESET] ${user.email} – new temp password: ${tempPassword}`);

        res.json({ message: 'Password reset successful', tempPassword });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Failed to reset password' });
    }
};