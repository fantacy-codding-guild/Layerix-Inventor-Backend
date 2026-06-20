import { Router } from 'express';
import { authenticate } from '../middleware/authenticate';
import { requireWriteAccess } from '../middleware/requireWriteAccess';
import {
    getStockOverview,
    stockIn,
    stockOut,
    getMovements,

} from '../controllers/inventory.controller';

const router = Router();
router.use(authenticate);

router.get('/stock-overview', getStockOverview);
router.post('/stock-in', requireWriteAccess, stockIn);
router.post('/stock-out', requireWriteAccess, stockOut);
router.get('/movements', getMovements);

export default router;