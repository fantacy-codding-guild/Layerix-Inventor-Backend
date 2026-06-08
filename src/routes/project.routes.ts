import { Router } from 'express';
import { authenticate } from '../middleware/authenticate';
import {
    getProjects, getProject, createProject, updateProject, deleteProject,
    getMilestones, createMilestone, updateMilestone, deleteMilestone,
    getMaterialPlans, addMaterialPlan, updateMaterialPlan, deleteMaterialPlan,
} from '../controllers/project.controller';

const router = Router();
router.use(authenticate);

// Projects CRUD
router.get('/', getProjects);
router.get('/:id', getProject);
router.post('/', createProject);
router.put('/:id', updateProject);
router.delete('/:id', deleteProject);

// Milestones under a project
router.get('/:id/milestones', getMilestones);
router.post('/:id/milestones', createMilestone);
router.put('/:id/milestones/:milestoneId', updateMilestone);
router.delete('/:id/milestones/:milestoneId', deleteMilestone);

// Material plans under a project
router.get('/:id/material-plans', getMaterialPlans);
router.post('/:id/material-plans', addMaterialPlan);
router.put('/:id/material-plans/:planId', updateMaterialPlan);
router.delete('/:id/material-plans/:planId', deleteMaterialPlan);

export default router;