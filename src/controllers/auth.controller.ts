//backend\src\controllers\auth.controller.ts
import prisma from '../lib/prisma';
import bcrypt from 'bcryptjs';
import jwt, { SignOptions } from 'jsonwebtoken';
import { sendOTPEmail } from '../utils/mailer';

const generateOTP = (): string =>
    Math.floor(100000 + Math.random() * 900000).toString();

const issueTokens = async (userId: number, tenantId: number, roleName: string) => {
    const accessToken = jwt.sign(
        { userId, tenantId, role: roleName },
        process.env.JWT_ACCESS_SECRET!,
        { expiresIn: process.env.JWT_ACCESS_EXPIRES || '15m' } as SignOptions
    );

    const refreshToken = jwt.sign(
        { userId },
        process.env.JWT_REFRESH_SECRET!,
        { expiresIn: process.env.JWT_REFRESH_EXPIRES || '7d' } as SignOptions
    );

    await prisma.refreshToken.create({
        data: {
            token: refreshToken,
            userId,
            expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        },
    });

    return { accessToken, refreshToken };
};

export const signup = async (req: any, res: any) => {
    try {
        const { tenantName, subdomain, contactEmail, phone, address, adminName, adminEmail } = req.body;

        const existing = await prisma.tenant.findUnique({ where: { subdomain } });
        if (existing) return res.status(400).json({ message: 'Subdomain taken' });

        const tenant = await prisma.tenant.create({
            data: { name: tenantName, subdomain, contactEmail: contactEmail || adminEmail, phone, address },
        });

        const adminRole = await prisma.role.create({
            data: { tenantId: tenant.id, name: 'admin', description: 'Administrator' },
        });

        // Create manager and team roles
        await prisma.role.create({
            data: { tenantId: tenant.id, name: 'manager', description: 'Manager' },
        });
        await prisma.role.create({
            data: { tenantId: tenant.id, name: 'team', description: 'Team member (read-only)' },
        });

        const otp = generateOTP();
        const otpExpiry = new Date(Date.now() + 10 * 60 * 1000);
        console.log(`[DEV OTP] ${adminEmail} → ${otp}`);

        const user = await prisma.user.create({
            data: {
                tenantId: tenant.id,
                name: adminName,
                email: adminEmail,
                passwordHash: '',
                roleId: adminRole.id,
                isActive: true,
                isVerified: false,
                otpCode: otp,
                otpExpiry,
                forcePasswordReset: false,
            },
        });

        await sendOTPEmail(adminEmail, otp);

        res.status(201).json({
            message: 'Signup successful. Please check your email for OTP.',
            email: adminEmail,
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Signup failed' });
    }
};

export const verifyOTPAndSetPassword = async (req: any, res: any) => {
    try {
        const { email, otp, password } = req.body;

        // Include role to get role.name
        const user = await prisma.user.findFirst({
            where: { email },
            include: { role: true },
        });
        if (!user) return res.status(400).json({ message: 'User not found' });
        if (user.isVerified) return res.status(400).json({ message: 'Already verified' });

        if (user.otpCode !== otp || !user.otpExpiry || user.otpExpiry < new Date()) {
            return res.status(400).json({ message: 'Invalid or expired OTP' });
        }

        const passwordHash = await bcrypt.hash(password, 12);

        await prisma.user.update({
            where: { id: user.id },
            data: {
                isVerified: true,
                passwordHash,
                otpCode: null,
                otpExpiry: null,
                forcePasswordReset: false,
            },
        });

        const tokens = await issueTokens(user.id, user.tenantId, user.role.name);
        res.json({ ...tokens, tenantId: user.tenantId, role: user.role.name, forcePasswordReset: false });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Verification failed' });
    }
};

export const login = async (req: any, res: any) => {
    try {
        const { email, password } = req.body;

        // Include role relation to access the role name
        const user = await prisma.user.findFirst({
            where: { email, isVerified: true, isActive: true },
            include: { role: true },
        });
        if (!user) return res.status(401).json({ message: 'Invalid credentials' });

        const valid = await bcrypt.compare(password, user.passwordHash);
        if (!valid) return res.status(401).json({ message: 'Invalid credentials' });

        const tokens = await issueTokens(user.id, user.tenantId, user.role.name);
        res.json({
            ...tokens,
            tenantId: user.tenantId,
            role: user.role.name,
            forcePasswordReset: user.forcePasswordReset,
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Login failed' });
    }
};

// ---------- Refresh tokens ----------
export const refresh = async (req: any, res: any) => {
    const refreshToken = req.cookies.refreshToken;
    if (!refreshToken) return res.status(401).json({ message: 'No refresh token' });

    try {
        const stored = await prisma.refreshToken.findUnique({
            where: { token: refreshToken },
            include: { user: { include: { role: true } } },   // include role
        });
        if (!stored || stored.expiresAt < new Date()) {
            return res.status(401).json({ message: 'Refresh token invalid or expired' });
        }

        const user = stored.user;
        const tokens = await issueTokens(user.id, user.tenantId, user.role.name);
        await prisma.refreshToken.delete({ where: { id: stored.id } });

        res.cookie('refreshToken', tokens.refreshToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict',
            maxAge: 7 * 24 * 60 * 60 * 1000,
        });
        res.json({ accessToken: tokens.accessToken });
    } catch (err) {
        res.status(401).json({ message: 'Invalid refresh token' });
    }
};

export const refreshToken = async (req: any, res: any) => {
    const { refreshToken } = req.body;
    if (!refreshToken) return res.status(400).json({ message: 'Refresh token required' });

    try {
        const decoded: any = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET!);
        const stored = await prisma.refreshToken.findUnique({
            where: { token: refreshToken },
            include: { user: { include: { role: true } } },   // include role
        });
        if (!stored || stored.expiresAt < new Date()) {
            return res.status(401).json({ message: 'Refresh token invalid or expired' });
        }

        const user = stored.user;
        const tokens = await issueTokens(user.id, user.tenantId, user.role.name);
        await prisma.refreshToken.delete({ where: { id: stored.id } });

        res.json({ accessToken: tokens.accessToken, refreshToken: tokens.refreshToken });
    } catch (error) {
        return res.status(401).json({ message: 'Invalid refresh token' });
    }
};

// ---------- Forgot Password ----------
export const forgotPassword = async (req: any, res: any) => {
    try {
        const { email } = req.body;
        if (!email) return res.status(400).json({ message: 'Email is required' });

        const user = await prisma.user.findFirst({ where: { email, isActive: true } });
        if (!user) {
            return res.json({ message: 'If the email exists, an OTP has been sent.' });
        }

        const otp = generateOTP();
        const otpExpiry = new Date(Date.now() + 10 * 60 * 1000);

        await prisma.user.update({
            where: { id: user.id },
            data: { otpCode: otp, otpExpiry },
        });

        await sendOTPEmail(email, otp);
        console.log(`[PASSWORD RESET OTP] ${email} → ${otp}`);

        res.json({ message: 'If the email exists, an OTP has been sent.' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Failed to process forgot password' });
    }
};

export const verifyResetOTP = async (req: any, res: any) => {
    try {
        const { email, otp } = req.body;
        const user = await prisma.user.findFirst({ where: { email, isActive: true } });
        if (!user) return res.status(400).json({ message: 'Invalid request' });

        if (user.otpCode !== otp || !user.otpExpiry || user.otpExpiry < new Date()) {
            return res.status(400).json({ message: 'Invalid or expired OTP' });
        }

        const resetToken = jwt.sign(
            { userId: user.id, purpose: 'password-reset' },
            process.env.JWT_ACCESS_SECRET!,
            { expiresIn: '10m' }
        );

        res.json({ resetToken });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'OTP verification failed' });
    }
};

export const resetPassword = async (req: any, res: any) => {
    try {
        const { resetToken, newPassword } = req.body;
        if (!resetToken || !newPassword) return res.status(400).json({ message: 'Missing fields' });

        let decoded: any;
        try {
            decoded = jwt.verify(resetToken, process.env.JWT_ACCESS_SECRET!);
        } catch {
            return res.status(400).json({ message: 'Invalid or expired reset token' });
        }

        if (decoded.purpose !== 'password-reset') return res.status(400).json({ message: 'Invalid token purpose' });

        const user = await prisma.user.findUnique({ where: { id: decoded.userId } });
        if (!user) return res.status(400).json({ message: 'User not found' });

        const passwordHash = await bcrypt.hash(newPassword, 12);

        await prisma.user.update({
            where: { id: user.id },
            data: {
                passwordHash,
                otpCode: null,
                otpExpiry: null,
                forcePasswordReset: false,
            },
        });

        res.json({ message: 'Password reset successful. You can now log in.' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Password reset failed' });
    }
};

export const forceResetPassword = async (req: any, res: any) => {
    try {
        const userId = req.user.userId;
        const { newPassword } = req.body;
        if (!newPassword) return res.status(400).json({ message: 'New password required' });

        const passwordHash = await bcrypt.hash(newPassword, 12);

        await prisma.user.update({
            where: { id: userId },
            data: {
                passwordHash,
                forcePasswordReset: false,
            },
        });

        res.json({ message: 'Password changed successfully' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Failed to reset password' });
    }
};