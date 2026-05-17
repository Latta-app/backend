import { Router } from 'express';
import AdminClinicActivityController from '../../controllers/admin-clinic-activity.controller.js';
import { verifyToken, checkRole } from '../../middlewares/auth.middleware.js';

const router = Router();

router.use(verifyToken);
router.use(checkRole(['superAdmin', 'admin']));

router.get('/clinics/activity-aggregates', AdminClinicActivityController.aggregates);
router.get('/clinics/locked-ranking', AdminClinicActivityController.lockedRanking);
router.get('/clinics/:id/activity-timeline', AdminClinicActivityController.timeline);

export default router;
