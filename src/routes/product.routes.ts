//backend\src\routes\product.routes.ts
import { Router } from 'express';
import { authenticate } from '../middleware/authenticate';
import { requireWriteAccess } from '../middleware/requireWriteAccess';
import {
    getProducts,
    getProduct,
    createProduct,
    updateProduct,
    deleteProduct,
} from '../controllers/product.controller';
import { getProductUnits } from '../controllers/productUnit.controller';   // new import


const router = Router();
router.use(authenticate);

router.get('/:id/units', getProductUnits);

router.get('/', getProducts);
router.get('/:id', getProduct);
router.post('/', requireWriteAccess, createProduct);
router.put('/:id', requireWriteAccess, updateProduct);
router.delete('/:id', requireWriteAccess, deleteProduct);

export default router;