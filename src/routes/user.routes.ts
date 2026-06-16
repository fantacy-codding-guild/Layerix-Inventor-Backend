import { Router } from 'express';
import { authenticate } from '../middleware/authenticate';
import { adminOnly } from '../middleware/adminOnly';
import {
    getMe,
    getUsers,
    updateUser,
    getRoles,
    createEmployee,
    resetUserPassword,
    deleteUser,   // new
} from '../controllers/user.controller';
import { requireWriteAccess } from '../middleware/requireWriteAccess';

const router = Router();
router.use(authenticate);

router.get('/me', getMe);
router.get('/roles', getRoles);

// Admin only
router.get('/', adminOnly, getUsers);
router.put('/:id', adminOnly, updateUser);
router.post('/create-employee', adminOnly, createEmployee);
router.delete('/:id', requireWriteAccess, deleteUser);
router.post('/:id/reset-password', requireWriteAccess, resetUserPassword);
export default router;