//backend\src\routes\brand.routes.ts
import { Router } from 'express';
import { authenticate } from '../middleware/authenticate';
import { requireWriteAccess } from '../middleware/requireWriteAccess';
import {
    getBrands,
    createBrand,
    updateBrand,
    deleteBrand,
} from '../controllers/brand.controller';

const router = Router();
router.use(authenticate);

router.get('/', getBrands);
router.post('/', requireWriteAccess, createBrand);
router.put('/:id', requireWriteAccess, updateBrand);
router.delete('/:id', requireWriteAccess, deleteBrand);

export default router;