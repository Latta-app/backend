import { Router } from 'express';
import ClinicNotificationsController from '../../controllers/clinic-notifications.controller.js';
import { verifyToken, checkRole } from '../../middlewares/auth.middleware.js';

const router = Router();

router.use(verifyToken);
router.use(checkRole(['clinic', 'admin', 'superAdmin']));

router.get('/', ClinicNotificationsController.list);
router.patch('/read-all', ClinicNotificationsController.markAllRead);
router.patch('/:id/read', ClinicNotificationsController.markRead);

export default router;
