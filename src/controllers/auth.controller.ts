//backend\src\controllers\auth.controller.ts
import prisma from '../lib/prisma';
import bcrypt from 'bcryptjs';
import jwt, { SignOptions } from 'jsonwebtoken';
import { sendOTPEmail } from '../utils/mailer';

const generateOTP = (): string =>
    Math.floor(100000 + Math.random() * 900000).toString();

const issueTokens = async (userId: number, tenantId: number, roleId: number) => {
    const accessToken = jwt.sign(
        { userId, tenantId, role: roleId },
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
            },
        });

        // await sendOTPEmail(adminEmail, otp);

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

        const user = await prisma.user.findFirst({ where: { email } });
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
            },
        });

        const tokens = await issueTokens(user.id, user.tenantId, user.roleId);
        res.json({ ...tokens, tenantId: user.tenantId, role: user.roleId });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Verification failed' });
    }
};

export const login = async (req: any, res: any) => {
    try {
        const { email, password, subdomain } = req.body;

        const tenant = await prisma.tenant.findUnique({ where: { subdomain } });
        if (!tenant) return res.status(401).json({ message: 'Invalid tenant' });

        const user = await prisma.user.findFirst({
            where: { tenantId: tenant.id, email, isVerified: true, isActive: true },
        });
        if (!user) return res.status(401).json({ message: 'Invalid credentials' });

        const valid = await bcrypt.compare(password, user.passwordHash);
        if (!valid) return res.status(401).json({ message: 'Invalid credentials' });

        const tokens = await issueTokens(user.id, user.tenantId, user.roleId);
        res.json({ ...tokens, tenantId: user.tenantId, role: user.roleId });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Login failed' });
    }
};

export const refresh = async (req: any, res: any) => {
    const refreshToken = req.cookies.refreshToken; // httpOnly cookie
    if (!refreshToken) return res.status(401).json({ message: 'No refresh token' });

    try {
        const stored = await prisma.refreshToken.findUnique({ where: { token: refreshToken } });
        if (!stored || stored.expiresAt < new Date()) {
            return res.status(401).json({ message: 'Refresh token invalid or expired' });
        }

        // Verify JWT
        const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET!) as any;
        const user = await prisma.user.findUnique({ where: { id: decoded.userId } });
        if (!user) return res.status(401).json({ message: 'User not found' });

        // Issue new tokens
        const tokens = await issueTokens(user.id, user.tenantId, user.roleId);

        // Delete old refresh token
        await prisma.refreshToken.delete({ where: { id: stored.id } });

        // Send new access token in response body, refresh token in httpOnly cookie
        res.cookie('refreshToken', tokens.refreshToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict',
            maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
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
        // Verify the token is valid and not expired
        const decoded: any = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET!);

        // Find the stored token
        const stored = await prisma.refreshToken.findUnique({
            where: { token: refreshToken },
            include: { user: true },
        });

        if (!stored || stored.expiresAt < new Date()) {
            return res.status(401).json({ message: 'Refresh token invalid or expired' });
        }

        // Issue new tokens
        const tokens = await issueTokens(stored.userId, stored.user.tenantId, stored.user.roleId);

        // Delete old refresh token and keep only the new one
        await prisma.refreshToken.delete({ where: { id: stored.id } });

        res.json({
            accessToken: tokens.accessToken,
            refreshToken: tokens.refreshToken,
        });
    } catch (error) {
        return res.status(401).json({ message: 'Invalid refresh token' });
    }
};