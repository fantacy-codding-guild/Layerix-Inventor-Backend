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

const router = Router();

router.use(authenticate);   // all routes below require auth

// Public read routes
router.get('/', getProducts);
router.get('/:id', getProduct);

// Write routes – only admin/manager can access
router.post('/', requireWriteAccess, createProduct);
router.put('/:id', requireWriteAccess, updateProduct);
router.delete('/:id', requireWriteAccess, deleteProduct);

export default router;
