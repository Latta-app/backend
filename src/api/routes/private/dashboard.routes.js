import { Router } from 'express';
import DashboardController from '../../controllers/dashboard.controller.js';
import { verifyToken, checkRole } from '../../middlewares/auth.middleware.js';

const router = Router();

router.get(
  '/summary',
  verifyToken,
  checkRole(['admin', 'superAdmin', 'attendant']),
  DashboardController.getDashboardSummary,
);

export default router;
