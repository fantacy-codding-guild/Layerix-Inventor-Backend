import { Router } from 'express';
import { authenticate } from '../middleware/authenticate';
import {
    getCustomers,
    getCustomer,
    createCustomer,
    updateCustomer,
    deleteCustomer,
} from '../controllers/customer.controller';
import { requireWriteAccess } from '../middleware/requireWriteAccess';

const router = Router();
router.use(authenticate);

router.get('/', getCustomers);
router.get('/:id', getCustomer);
router.post('/', requireWriteAccess, createCustomer);
router.put('/:id', requireWriteAccess, updateCustomer);
router.delete('/:id', requireWriteAccess, deleteCustomer);


export default router;