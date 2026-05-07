import { Router } from 'express';
import AIFeedbackController from '../../controllers/ai-feedback.controller.js';
import { verifyToken, checkRole } from '../../middlewares/auth.middleware.js';

const router = Router();

// Migrado do webhook N8n /thumbs na Fase 4 (2026-05). Operador clica
// 👍/👎 numa sugestão IA Offer/Scheduling no painel — UPDATE no registro
// mais recente da tabela ai_agent_output.
router.post(
  '/thumbs',
  verifyToken,
  checkRole(['admin', 'superAdmin', 'attendant']),
  AIFeedbackController.setThumbs,
);

export default router;
