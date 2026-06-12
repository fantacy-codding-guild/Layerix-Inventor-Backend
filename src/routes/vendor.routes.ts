import { Router } from 'express';
import { authenticate } from '../middleware/authenticate';
import {
    getVendors,
    getVendor,
    createVendor,
    updateVendor,
    deleteVendor,
    deleteAllVendorContacts,
    deleteVendorContact,
    updateVendorContact,
    addVendorContact,
    getVendorContacts,
} from '../controllers/vendor.controller';
import { requireWriteAccess } from '../middleware/requireWriteAccess';

const router = Router();
router.use(authenticate);

router.get('/', getVendors);
router.get('/:id', getVendor);
router.post('/', requireWriteAccess, createVendor);
router.put('/:id', requireWriteAccess, updateVendor);
router.delete('/:id', requireWriteAccess, deleteVendor);

// Contacts
router.get('/:id/contacts', getVendorContacts);
router.post('/:id/contacts', requireWriteAccess, addVendorContact);
router.put('/:id/contacts/:contactId', requireWriteAccess, updateVendorContact);
router.delete('/:id/contacts/:contactId', requireWriteAccess, deleteVendorContact);
router.delete('/:id/contacts/all', requireWriteAccess, deleteAllVendorContacts);
export default router;