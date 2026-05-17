import { Router } from 'express';
import ClinicActivityLogController from '../../controllers/clinic-activity-log.controller.js';
import { verifyToken, checkRole } from '../../middlewares/auth.middleware.js';

const router = Router();

router.use(verifyToken);
router.use(checkRole(['clinic', 'admin', 'superAdmin']));

router.post('/log', ClinicActivityLogController.submit);

export default router;
