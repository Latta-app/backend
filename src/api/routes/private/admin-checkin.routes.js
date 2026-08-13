// Gate via JWT + roles admin/superAdmin, mesmo pattern do
// admin-scheduling-metrics.routes.js.

import { Router } from 'express';
import { overview } from '../../controllers/admin-checkin.controller.js';
import { verifyToken, checkRole } from '../../middlewares/auth.middleware.js';

const router = Router();

router.use(verifyToken);
router.use(checkRole(['superAdmin', 'admin']));

router.get('/checkin/overview', overview);

export default router;
