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

const router = Router();
router.use(authenticate);

router.get('/', getVendors);
router.get('/:id', getVendor);
router.post('/', createVendor);
router.put('/:id', updateVendor);
router.delete('/:id', deleteVendor);

// Vendor‑Product mappings
router.get('/:id/products', getVendorProducts);
router.post('/:id/products', addVendorProduct);
router.put('/:id/products/:productId', updateVendorProduct);
router.delete('/:id/products/:productId', removeVendorProduct);
router.get('/:id/detail', getVendorDetail);

export default router;