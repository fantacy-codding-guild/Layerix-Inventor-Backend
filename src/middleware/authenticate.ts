//backend\src\middleware\authenticate.ts
import jwt from 'jsonwebtoken';

export const authenticate = (req: any, res: any, next: any) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ message: 'No token' });

    const token = authHeader.split(' ')[1];
    try {
        const decoded = jwt.verify(token, process.env.JWT_ACCESS_SECRET!) as jwt.JwtPayload;
        req.user = {
            userId: decoded.userId,
            tenantId: decoded.tenantId,
            role: decoded.role,
        };
        next();
    } catch (err) {
        return res.status(403).json({ message: 'Invalid or expired token' });
    }
};