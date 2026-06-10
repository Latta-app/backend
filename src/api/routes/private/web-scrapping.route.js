import { Router } from 'express';
import WebScrappingController from '../../controllers/web-scarpping.controller.js';
import PetzAccessController from '../../controllers/petz-access.controller.js';

const router = Router();

router.post('/login-petz', WebScrappingController.loginPetz);
router.post('/petz/sms', WebScrappingController.submitSmsCode);
router.post('/login-cobasi', WebScrappingController.loginCobasi);

// Lookup do número mascarado da conta Petz (diligência "final XXXX" no onboarding)
router.post('/petz/access', PetzAccessController.petzAccessLookup);

export default router;
