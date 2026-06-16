// backend/src/routes/inventory.routes.ts

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
    updateMovement,   // ← add this
    deleteMovement,   // ← add this
} from '../controllers/inventory.controller';
import { requireWriteAccess } from '../middleware/requireWriteAccess';

const router = Router();
router.use(authenticate);

// Stock overview & alerts
router.get('/stock-overview', getStockOverview);
router.get('/low-stock-alerts', getLowStockAlerts);

// Stock operations (write)
router.post('/stock-in', requireWriteAccess, stockIn);
router.post('/stock-out', requireWriteAccess, stockOut);
router.post('/adjustment', requireWriteAccess, adjustment);

// Movements (read + write)
router.get('/movements', getMovements);
router.put('/movements/:id', requireWriteAccess, updateMovement);      // ← new
router.delete('/movements/:id', requireWriteAccess, deleteMovement);   // ← new

// Reservations
router.get('/reservations', getReservations);
router.post('/reserve', requireWriteAccess, reserveStock);
router.post('/release-reservation/:id', requireWriteAccess, releaseReservation);

export default router;