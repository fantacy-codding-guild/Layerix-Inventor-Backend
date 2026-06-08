import { Router } from 'express';
import { authenticate } from '../middleware/authenticate';
import { getMe, getUsers, updateUser, getRoles } from '../controllers/user.controller';
import { adminOnly } from '../middleware/adminOnly';

const router = Router();
router.use(authenticate);

router.get('/me', getMe);          // any authenticated user
router.get('/roles', getRoles);    // any authenticated user (for dropdowns)

// Admin-only routes
router.get('/', getUsers);          // admin middleware will be added inline, but we'll use a separate middleware
router.put('/:id', updateUser);

router.get('/', adminOnly, getUsers);
router.put('/:id', adminOnly, updateUser);

export default router;