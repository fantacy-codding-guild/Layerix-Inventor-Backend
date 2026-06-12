import { Router } from 'express';
import { authenticate } from '../middleware/authenticate';
import { requireWriteAccess } from '../middleware/requireWriteAccess';
import {
    createTransfer,
    getTransfers,
    approveTransfer,
    dispatchTransfer,
    receiveTransfer,
} from '../controllers/transfer.controller';

const router = Router();
router.use(authenticate);

router.post('/', requireWriteAccess, createTransfer);
router.get('/', getTransfers);
router.put('/:id/approve', requireWriteAccess, approveTransfer);
router.put('/:id/dispatch', requireWriteAccess, dispatchTransfer);
router.put('/:id/receive', requireWriteAccess, receiveTransfer);

export default router;