import { Router } from 'express';
import { authenticate } from '../middleware/authenticate';
import {
    inventoryValuation,
    projectMaterialReport,
    purchaseSummary,
    profitabilityReport,
} from '../controllers/report.controller';
import { requireWriteAccess } from '../middleware/requireWriteAccess';

const router = Router();
router.use(authenticate);

router.get('/inventory-valuation', inventoryValuation);
router.get('/project-material', projectMaterialReport);
router.get('/purchase-summary', purchaseSummary);
router.get('/profitability', profitabilityReport);

export default router;