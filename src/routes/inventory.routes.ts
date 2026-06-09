import { Router } from 'express';
import { authenticate } from '../middleware/authenticate';
import {
    getStockOverview,
    getLowStockAlerts,
    stockIn,
    stockOut,
    adjustment,
    getReservations,
    reserveStock,
    releaseReservation,
    getMovements,
} from '../controllers/inventory.controller';
import { requireWriteAccess } from '../middleware/requireWriteAccess';

const router = Router();
router.use(authenticate);

router.get('/stock-overview', getStockOverview);
router.get('/low-stock-alerts', getLowStockAlerts);

router.post('/stock-in', requireWriteAccess, stockIn);
router.post('/stock-out', requireWriteAccess, stockOut);
router.post('/adjustment', requireWriteAccess, adjustment);

router.get('/movements', getMovements);

router.get('/reservations', getReservations);
router.post('/reserve', requireWriteAccess, reserveStock);
router.post('/release-reservation/:id', requireWriteAccess, releaseReservation);

export default router;