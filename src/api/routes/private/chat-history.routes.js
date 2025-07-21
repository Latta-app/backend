import { Router } from 'express';
import ChatController from '../../controllers/chat-history.controller.js';
import { verifyToken, checkRole } from '../../middlewares/auth.middleware.js';

const router = Router();

router.get(
  '/messages/getAllContactsWithMessages',
  verifyToken,
  checkRole(['admin', 'superAdmin']),
  ChatController.getAllContactsWithMessages,
);

router.get(
  '/messages/phone/:phone',
  verifyToken,
  checkRole(['admin', 'superAdmin']),
  ChatController.getMessagesByPhone,
);

export default router;
