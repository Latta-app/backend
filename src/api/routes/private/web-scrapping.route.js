import { Router } from 'express';
import WebScrappingController from '../../controllers/web-scarpping.controller.js';

const router = Router();

router.post('/login-petz', WebScrappingController.loginPetz);
router.post('/petz/sms', WebScrappingController.submitSmsCode);
router.post('/login-cobasi', WebScrappingController.loginCobasi);

export default router;
