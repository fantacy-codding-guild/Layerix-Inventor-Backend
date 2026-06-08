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

const router = Router();
router.use(authenticate);

router.get('/stock-overview', getStockOverview);
router.get('/low-stock-alerts', getLowStockAlerts);

router.post('/stock-in', stockIn);
router.post('/stock-out', stockOut);
router.post('/adjustment', adjustment);

router.get('/movements', getMovements);

router.get('/reservations', getReservations);
router.post('/reserve', reserveStock);
router.post('/release-reservation/:id', releaseReservation);

export default router;