// backend/src/routes/projectMaterial.routes.ts
import { Router } from 'express';
import { authenticate } from '../middleware/authenticate';
import { requireWriteAccess } from '../middleware/requireWriteAccess';
import {
    orderMaterial,
    consumeMaterial,
    transferOutMaterial,
    getProjectMovements,
} from '../controllers/projectMaterial.controller';

const router = Router();
router.use(authenticate);

router.get('/:id/movements', getProjectMovements);
router.post('/:id/order', requireWriteAccess, orderMaterial);
router.post('/:id/consume', requireWriteAccess, consumeMaterial);
router.post('/:id/transfer-out', requireWriteAccess, transferOutMaterial);

export default router;