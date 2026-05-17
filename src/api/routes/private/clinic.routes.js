import { Router } from 'express';
import ClinicController from '../../controllers/clinic.controller.js';
import { verifyToken } from '../../middlewares/auth.middleware.js';

const router = Router();

// Lead de "Quer conhecer o sistema completo?" — clinic clicou em secao locked
router.post('/interest-lead', verifyToken, ClinicController.submitInterestLead);

export default router;
