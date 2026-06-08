import { Router } from 'express';
import { authenticate } from '../middleware/authenticate';
import {
    getCustomers,
    getCustomer,
    createCustomer,
    updateCustomer,
    deleteCustomer,
} from '../controllers/customer.controller';
import { getVendorDetail } from '../controllers/vendor.controller';

const router = Router();
router.use(authenticate);

router.get('/', getCustomers);
router.get('/:id', getCustomer);
router.post('/', createCustomer);
router.put('/:id', updateCustomer);
router.delete('/:id', deleteCustomer);
router.get('/:id/detail', getVendorDetail);


export default router;