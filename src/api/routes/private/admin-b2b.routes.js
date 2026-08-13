import { Router } from 'express';
import { overview } from '../../controllers/admin-b2b.controller.js';
import { verifyToken, checkRole } from '../../middlewares/auth.middleware.js';

const router = Router();

router.use(verifyToken);
router.use(checkRole(['superAdmin', 'admin']));

router.get('/b2b/overview', overview);

export default router;
