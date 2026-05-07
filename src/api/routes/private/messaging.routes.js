import { Router } from 'express';
import MessagingController from '../../controllers/messaging.controller.js';
import { verifyToken, checkRole } from '../../middlewares/auth.middleware.js';

const router = Router();

// Substitui webhook N8n /4d712c65... — texto livre do painel.
router.post(
  '/send-text',
  verifyToken,
  checkRole(['admin', 'superAdmin', 'attendant']),
  MessagingController.sendText,
);

// Substitui webhook N8n /template — envio de template aprovado.
router.post(
  '/send-template',
  verifyToken,
  checkRole(['admin', 'superAdmin', 'attendant']),
  MessagingController.sendTemplate,
);

export default router;
