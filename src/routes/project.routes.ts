import { Router } from 'express';
import { authenticate } from '../middleware/authenticate';
import { requireWriteAccess } from '../middleware/requireWriteAccess';
import {
    getProjects,
    getProject,
    createProject,
    updateProject,
    deleteProject,
} from '../controllers/project.controller';
import {
    orderMaterial,
    consumeMaterial,
    transferOutMaterial,
    getProjectMovements,
    getProjectStock,
} from '../controllers/projectMaterial.controller';

const router = Router();
router.use(authenticate);

// Basic CRUD
router.get('/', getProjects);
router.get('/:id', getProject);
router.post('/', requireWriteAccess, createProject);
router.put('/:id', requireWriteAccess, updateProject);
router.delete('/:id', requireWriteAccess, deleteProject);

// Project material movements (NEW)
router.get('/:id/movements', getProjectMovements);
router.post('/:id/order', requireWriteAccess, orderMaterial);
router.post('/:id/consume', requireWriteAccess, consumeMaterial);
router.post('/:id/transfer-out', requireWriteAccess, transferOutMaterial);
router.get('/:id/project-stock', getProjectStock);

export default router;