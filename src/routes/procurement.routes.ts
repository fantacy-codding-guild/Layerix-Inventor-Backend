import { Router } from 'express';
import { authenticate } from '../middleware/authenticate';
import {
    getPurchaseRequests, getPurchaseRequest, createPurchaseRequest, updatePurchaseRequest, deletePurchaseRequest,
} from '../controllers/purchaseRequest.controller';
import {
    getPurchaseOrders, getPurchaseOrder, createPurchaseOrder, updatePurchaseOrder, deletePurchaseOrder,
} from '../controllers/purchaseOrder.controller';
import { createGoodsReceived, getGoodsReceived } from '../controllers/goodsReceived.controller';

const router = Router();
router.use(authenticate);

// Purchase Requests
router.get('/purchase-requests', getPurchaseRequests);
router.get('/purchase-requests/:id', getPurchaseRequest);
router.post('/purchase-requests', createPurchaseRequest);
router.put('/purchase-requests/:id', updatePurchaseRequest);
router.delete('/purchase-requests/:id', deletePurchaseRequest);

// Purchase Orders
router.get('/purchase-orders', getPurchaseOrders);
router.get('/purchase-orders/:id', getPurchaseOrder);
router.post('/purchase-orders', createPurchaseOrder);
router.put('/purchase-orders/:id', updatePurchaseOrder);
router.delete('/purchase-orders/:id', deletePurchaseOrder);

router.get('/goods-received', getGoodsReceived);
router.post('/goods-received', createGoodsReceived);

export default router;