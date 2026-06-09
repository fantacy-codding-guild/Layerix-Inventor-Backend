import { Router } from 'express';
import { authenticate } from '../middleware/authenticate';
import { getBrands, createBrand, updateBrand, deleteBrand } from '../controllers/brand.controller';
import { requireWriteAccess } from '../middleware/requireWriteAccess';

const router = Router();
router.use(authenticate);
router.get('/', getBrands);
router.post('/', requireWriteAccess, createBrand);
router.put('/:id', requireWriteAccess, updateBrand);
router.delete('/:id', requireWriteAccess, deleteBrand);
export default router;