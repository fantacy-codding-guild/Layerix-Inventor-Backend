export const requireWriteAccess = (req: any, res: any, next: any) => {
    // Admins and managers can write
    if (req.user?.role === 'admin' || req.user?.role === 'manager') {
        return next();
    }
    return res.status(403).json({ message: 'Read-only access – you cannot modify data' });
};