import { Router } from 'express';
import { authenticate } from '../middleware/authenticate';
import { getAMCs, getAMC, createAMC, updateAMC, deleteAMC } from '../controllers/amc.controller';

const router = Router();
router.use(authenticate);
router.get('/', getAMCs);
router.get('/:id', getAMC);
router.post('/', createAMC);
router.put('/:id', updateAMC);
router.delete('/:id', deleteAMC);

export default router;