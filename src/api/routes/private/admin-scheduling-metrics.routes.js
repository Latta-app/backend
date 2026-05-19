// Fatia 5 do plano scheduling-agent-state-of-the-art: endpoint dashboard.
// Gate via JWT + roles 'admin'/'superAdmin' (mesmo pattern de
// admin-clinic-activity.routes.js).

import { Router } from 'express';
import { schedulingMetrics } from '../../controllers/admin-scheduling-metrics.controller.js';
import { verifyToken, checkRole } from '../../middlewares/auth.middleware.js';

const router = Router();

router.use(verifyToken);
router.use(checkRole(['superAdmin', 'admin']));

router.get('/scheduling/metrics', schedulingMetrics);

export default router;
