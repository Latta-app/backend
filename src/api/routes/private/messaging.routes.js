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

// Migrado do webhook N8n /ai_accepted na Fase 4 (2026-05). Operador
// aprova/edita sugestão IA Offer ou Scheduling no painel e dispara
// envio. Body: { contact_id, message, is_modificated? }.
router.post(
  '/send-ai-suggestion',
  verifyToken,
  checkRole(['admin', 'superAdmin', 'attendant']),
  MessagingController.sendAISuggestion,
);

export default router;
