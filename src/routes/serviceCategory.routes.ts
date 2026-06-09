import { Router } from 'express';
import { authenticate } from '../middleware/authenticate';
import { getServiceCategories, createServiceCategory, updateServiceCategory, deleteServiceCategory } from '../controllers/serviceCategory.controller';
import { requireWriteAccess } from '../middleware/requireWriteAccess';

const router = Router();
router.use(authenticate);
router.get('/', getServiceCategories);
router.post('/', requireWriteAccess, createServiceCategory);
router.put('/:id', requireWriteAccess, updateServiceCategory);
router.delete('/:id', requireWriteAccess, deleteServiceCategory);
export default router;