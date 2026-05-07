import { Router } from 'express';
import ContactController from '../../controllers/contact.controller.js';
import { verifyToken, checkRole } from '../../middlewares/auth.middleware.js';

const router = Router();

router.patch(
  '/:id/toggle-attendance',
  verifyToken,
  checkRole(['admin', 'superAdmin', 'attendant']),
  ContactController.toggleAttendance,
);

// Set explicit (não toggle) — usado quando o painel envia mensagem/template
// pela Luma e precisa garantir is_being_attended=true sem depender do estado
// anterior. Toggle continua existindo pra controle manual via dropdown.
router.patch(
  '/:id/attendance',
  verifyToken,
  checkRole(['admin', 'superAdmin', 'attendant']),
  ContactController.setAttendance,
);

// Migrado do webhook N8n /responsability na Fase 4 (2026-05). Define
// quem está no comando da conversa: latta (bot), petshop (humano), ou
// custom. Body: { user_id, path }.
router.patch(
  '/:id/responsibility',
  verifyToken,
  checkRole(['admin', 'superAdmin', 'attendant']),
  ContactController.setResponsibility,
);

export default router;
