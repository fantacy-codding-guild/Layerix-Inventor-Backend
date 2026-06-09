import { Router } from 'express';
import { authenticate } from '../middleware/authenticate';
import {
    getProjects, getProject, createProject, updateProject, deleteProject,
    getMilestones, createMilestone, updateMilestone, deleteMilestone,
    getMaterialPlans, addMaterialPlan, updateMaterialPlan, deleteMaterialPlan,
} from '../controllers/project.controller';
import { requireWriteAccess } from '../middleware/requireWriteAccess';

const router = Router();
router.use(authenticate);

// Projects CRUD
router.get('/', getProjects);
router.get('/:id', getProject);
router.post('/', requireWriteAccess, createProject);
router.put('/:id', requireWriteAccess, updateProject);
router.delete('/:id', requireWriteAccess, deleteProject);

// Milestones under a project
router.get('/:id/milestones', getMilestones);
router.post('/:id/milestones', requireWriteAccess, createMilestone);
router.put('/:id/milestones/:milestoneId', requireWriteAccess, updateMilestone);
router.delete('/:id/milestones/:milestoneId', requireWriteAccess, deleteMilestone);

// Material plans under a project
router.get('/:id/material-plans', getMaterialPlans);
router.post('/:id/material-plans', requireWriteAccess, addMaterialPlan);
router.put('/:id/material-plans/:planId', requireWriteAccess, updateMaterialPlan);
router.delete('/:id/material-plans/:planId', requireWriteAccess, deleteMaterialPlan);

export default router;