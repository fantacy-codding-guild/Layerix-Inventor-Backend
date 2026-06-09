import { Router } from 'express';
import { authenticate } from '../middleware/authenticate';
import {
    getVendors,
    getVendor,
    createVendor,
    updateVendor,
    deleteVendor,
    getVendorProducts,
    addVendorProduct,
    updateVendorProduct,
    removeVendorProduct,
    getVendorDetail,
} from '../controllers/vendor.controller';
import { requireWriteAccess } from '../middleware/requireWriteAccess';

const router = Router();
router.use(authenticate);

router.get('/', getVendors);
router.get('/:id', getVendor);
router.post('/', requireWriteAccess, createVendor);
router.put('/:id', requireWriteAccess, updateVendor);
router.delete('/:id', requireWriteAccess, deleteVendor);

// Vendor‑Product mappings
router.get('/:id/products', getVendorProducts);
router.post('/:id/products', requireWriteAccess, addVendorProduct);
router.put('/:id/products/:productId', requireWriteAccess, updateVendorProduct);
router.delete('/:id/products/:productId', requireWriteAccess, removeVendorProduct);
router.get('/:id/detail', getVendorDetail);

export default router;