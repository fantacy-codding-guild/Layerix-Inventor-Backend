import { Router } from 'express';
import { authenticate } from '../middleware/authenticate';
import { getServiceCategories, createServiceCategory, updateServiceCategory, deleteServiceCategory } from '../controllers/serviceCategory.controller';

const router = Router();
router.use(authenticate);
router.get('/', getServiceCategories);
router.post('/', createServiceCategory);
router.put('/:id', updateServiceCategory);
router.delete('/:id', deleteServiceCategory);
export default router;