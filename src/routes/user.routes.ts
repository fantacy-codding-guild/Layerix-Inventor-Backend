import { Router } from 'express';
import { authenticate } from '../middleware/authenticate';
import { adminOnly } from '../middleware/adminOnly';
import {
    getMe,
    getUsers,
    updateUser,
    getRoles,
    createEmployee,   // new
} from '../controllers/user.controller';

const router = Router();
router.use(authenticate);

router.get('/me', getMe);
router.get('/roles', getRoles);

// Admin only
router.get('/', adminOnly, getUsers);
router.put('/:id', adminOnly, updateUser);
router.post('/create-employee', adminOnly, createEmployee);

export default router;