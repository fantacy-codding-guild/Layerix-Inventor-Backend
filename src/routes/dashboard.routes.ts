import { Router } from 'express';
import { authenticate } from '../middleware/authenticate';
import { inventorySummary } from '../controllers/dashboard.controller';

const router = Router();

// All dashboard routes require authentication
router.use(authenticate);

router.get('/inventory-summary', inventorySummary);

export default router;