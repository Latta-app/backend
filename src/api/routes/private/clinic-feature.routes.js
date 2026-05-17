import { Router } from 'express';
import ClinicFeatureController from '../../controllers/clinic-feature.controller.js';
import { verifyToken } from '../../middlewares/auth.middleware.js';

const router = Router();

router.use(verifyToken);

// Endpoint sem o middleware requireClinicPortalFlag — o frontend chama aqui
// pra decidir se mostra o painel ou a tela "acesso em beta". Resposta sempre
// 200 quando autenticado.
router.get('/feature-check', ClinicFeatureController.featureCheck);

export default router;
