import { Router } from 'express';
import WebScrappingController from '../../controllers/web-scarpping.controller.js';
import PetzOtpController from '../../controllers/petz-otp.controller.js';

const router = Router();

router.post('/login-petz', WebScrappingController.loginPetz);
router.post('/petz/sms', WebScrappingController.submitSmsCode);
router.post('/login-cobasi', WebScrappingController.loginCobasi);

// Petz OTP quick-access (caminho B do connect-or-create — all-in-browser)
router.post('/petz/otp/start', PetzOtpController.petzOtpStart);
router.post('/petz/otp/verify', PetzOtpController.petzOtpVerify);

export default router;
