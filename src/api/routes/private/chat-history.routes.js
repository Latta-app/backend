import { Router } from 'express';
import ChatController from '../../controllers/chat-history.controller.js';
import { verifyToken, checkRole } from '../../middlewares/auth.middleware.js';

const router = Router();

router.get(
  '/messages/getAllContactsWithMessages',
  verifyToken,
  checkRole(['admin', 'superAdmin', 'attendant']),
  ChatController.getAllContactsWithMessages,
);

router.get(
  '/messages/searchContacts',
  verifyToken,
  checkRole(['admin', 'superAdmin', 'attendant']),
  ChatController.searchContacts,
);

export default router;
