import { Router } from 'express';
import AuthController from '../../controllers/auth.controller.js';
import { verifyToken } from '../../middlewares/auth.middleware.js';

const router = Router();

router.post('/login', AuthController.login);
router.post('/logout', verifyToken, AuthController.logout);

export default router;
