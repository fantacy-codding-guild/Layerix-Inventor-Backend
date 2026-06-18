import { Router } from 'express';
import { authenticate } from '../middleware/authenticate';
import { requireWriteAccess } from '../middleware/requireWriteAccess';
import {
    getStates,
    createState,
    updateState,
    deleteState,
} from '../controllers/state.controller';

const router = Router();
router.use(authenticate);

router.get('/', getStates);
router.post('/', requireWriteAccess, createState);
router.put('/:id', requireWriteAccess, updateState);
router.delete('/:id', requireWriteAccess, deleteState);

export default router;