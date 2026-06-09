import { Router } from 'express';
import { authenticate } from '../middleware/authenticate';
import {
    getPurchaseRequests, getPurchaseRequest, createPurchaseRequest, updatePurchaseRequest, deletePurchaseRequest,
} from '../controllers/purchaseRequest.controller';
import {
    getPurchaseOrders, getPurchaseOrder, createPurchaseOrder, updatePurchaseOrder, deletePurchaseOrder,
} from '../controllers/purchaseOrder.controller';
import { createGoodsReceived, getGoodsReceived } from '../controllers/goodsReceived.controller';
import { requireWriteAccess } from '../middleware/requireWriteAccess';

const router = Router();
router.use(authenticate);

// Purchase Requests
router.get('/purchase-requests', getPurchaseRequests);
router.get('/purchase-requests/:id', getPurchaseRequest);
router.post('/purchase-requests', requireWriteAccess, createPurchaseRequest);
router.put('/purchase-requests/:id', requireWriteAccess, updatePurchaseRequest);
router.delete('/purchase-requests/:id', requireWriteAccess, deletePurchaseRequest);

// Purchase Orders
router.get('/purchase-orders', getPurchaseOrders);
router.get('/purchase-orders/:id', getPurchaseOrder);
router.post('/purchase-orders', requireWriteAccess, createPurchaseOrder);
router.put('/purchase-orders/:id', requireWriteAccess, updatePurchaseOrder);
router.delete('/purchase-orders/:id', requireWriteAccess, deletePurchaseOrder);

router.get('/goods-received', getGoodsReceived);
router.post('/goods-received', requireWriteAccess, createGoodsReceived);

export default router;