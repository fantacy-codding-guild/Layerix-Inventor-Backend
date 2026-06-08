import { Router } from 'express';
import { authenticate } from '../middleware/authenticate';
import {
    getServiceTickets,
    getServiceTicket,
    createServiceTicket,
    updateServiceTicket,
    deleteServiceTicket,
} from '../controllers/serviceTicket.controller';

const router = Router();
router.use(authenticate);

router.get('/', getServiceTickets);
router.get('/:id', getServiceTicket);
router.post('/', createServiceTicket);
router.put('/:id', updateServiceTicket);
router.delete('/:id', deleteServiceTicket);

export default router;