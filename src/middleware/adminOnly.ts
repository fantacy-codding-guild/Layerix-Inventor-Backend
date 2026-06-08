//backend\src\middleware\adminOnly.ts
export const adminOnly = (req: any, res: any, next: any) => {
    // The token contains a 'role' field (the role name). If it's not 'admin', reject.
    if (req.user?.role !== 'admin') {
        return res.status(403).json({ message: 'Admin access required' });
    }
    next();
};