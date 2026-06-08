import { Router } from 'express';
import { authenticate } from '../middleware/authenticate';
import { adminOnly } from '../middleware/adminOnly';   // optional – only admins can view logs
import { getActivityLogs } from '../controllers/activityLog.controller';

const router = Router();
router.use(authenticate);

router.get('/', adminOnly, getActivityLogs);   // restrict to admins (optional)

export default router;