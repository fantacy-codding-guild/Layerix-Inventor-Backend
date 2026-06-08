import { Router } from 'express';
import { authenticate } from '../middleware/authenticate';
import {
    getProducts,
    getProduct,
    createProduct,
    updateProduct,
    deleteProduct,
} from '../controllers/product.controller';

const router = Router();

router.use(authenticate);   // all routes below require auth

router.get('/', getProducts);
router.get('/:id', getProduct);
router.post('/', createProduct);
router.put('/:id', updateProduct);
router.delete('/:id', deleteProduct);

export default router;