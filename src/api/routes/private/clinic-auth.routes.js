import { Router } from 'express';
import ClinicAuthController from '../../controllers/clinic-auth.controller.js';
import { verifyToken, checkRole } from '../../middlewares/auth.middleware.js';

const router = Router();

// Endpoints publicos (sem JWT) — usados pelas paginas da clinica
router.post('/login', ClinicAuthController.login);
router.post('/activate', ClinicAuthController.activate);
router.post('/forgot-password', ClinicAuthController.forgotPassword);
router.post('/reset-password', ClinicAuthController.resetPassword);

// Endpoint admin — admin triggera ativacao manualmente
router.post(
  '/request-activation',
  verifyToken,
  checkRole(['admin', 'superAdmin']),
  ClinicAuthController.requestActivation,
);

export default router;
