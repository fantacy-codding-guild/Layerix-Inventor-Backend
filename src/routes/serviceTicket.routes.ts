import { Router } from 'express';
import { authenticate } from '../middleware/authenticate';
import {
    getServiceTickets,
    getServiceTicket,
    createServiceTicket,
    updateServiceTicket,
    deleteServiceTicket,
} from '../controllers/serviceTicket.controller';
import { requireWriteAccess } from '../middleware/requireWriteAccess';

const router = Router();
router.use(authenticate);

router.get('/', getServiceTickets);
router.get('/:id', getServiceTicket);
router.post('/', requireWriteAccess, createServiceTicket);
router.put('/:id', requireWriteAccess, updateServiceTicket);
router.delete('/:id', requireWriteAccess, deleteServiceTicket);

export default router;