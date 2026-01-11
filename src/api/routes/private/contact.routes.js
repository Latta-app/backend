import { Router } from 'express';
import ContactController from '../../controllers/contact.controller.js';
import { verifyToken, checkRole } from '../../middlewares/auth.middleware.js';

const router = Router();

router.patch(
  '/:id/toggle-attendance',
  verifyToken,
  checkRole(['admin', 'superAdmin', 'attendant']),
  ContactController.toggleAttendance,
);

export default router;
