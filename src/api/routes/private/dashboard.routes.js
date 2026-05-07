import { Router } from 'express';
import DashboardController from '../../controllers/dashboard.controller.js';
import { verifyToken, checkRole } from '../../middlewares/auth.middleware.js';

const router = Router();
const ALLOWED = ['admin', 'superAdmin', 'attendant'];

router.get(
  '/summary',
  verifyToken,
  checkRole(ALLOWED),
  DashboardController.getDashboardSummary,
);

router.get(
  '/abandoned',
  verifyToken,
  checkRole(ALLOWED),
  DashboardController.getAbandonedFlows,
);

router.get(
  '/search',
  verifyToken,
  checkRole(ALLOWED),
  DashboardController.searchPhone,
);

router.get(
  '/funnel/:step',
  verifyToken,
  checkRole(ALLOWED),
  DashboardController.getFunnelStep,
);

router.get(
  '/onboarding-funnel',
  verifyToken,
  checkRole(ALLOWED),
  DashboardController.getOnboardingFunnel,
);

router.get(
  '/pro-revenue-channels',
  verifyToken,
  checkRole(ALLOWED),
  DashboardController.getProRevenueChannels,
);

router.get(
  '/contact/:phone',
  verifyToken,
  checkRole(ALLOWED),
  DashboardController.getContactDrilldown,
);

export default router;
