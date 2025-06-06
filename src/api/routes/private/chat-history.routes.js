import { Router } from 'express';
import ChatController from '../../controllers/chat-history.controller.js';
import { verifyToken, checkRole } from '../../middlewares/auth.middleware.js';

const router = Router();

// Obter todas as mensagens (agrupadas por número de telefone)
router.get(
  '/messages',
  verifyToken,
  checkRole(['admin', 'superAdmin']),
  ChatController.getAllMessages,
);

// Obter mensagens de um número específico
router.get(
  '/messages/phone/:phone',
  verifyToken,
  checkRole(['admin', 'superAdmin']),
  ChatController.getMessagesByPhone,
);

export default router;
