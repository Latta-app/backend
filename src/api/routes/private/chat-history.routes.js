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

router.get(
  '/messages/getContactByPetOwnerId/:pet_owner_id',
  verifyToken,
  checkRole(['admin', 'superAdmin', 'attendant']),
  ChatController.getContactByPetOwnerId,
);

router.get(
  '/messages/loadMore/:pet_owner_id',
  verifyToken,
  checkRole(['admin', 'superAdmin', 'attendant']),
  ChatController.getContactByPetOwnerId,
);

router.get(
  '/messages/getAllContactsMessagesWithNoFilters',
  verifyToken,
  checkRole(['admin', 'superAdmin', 'attendant']),
  ChatController.getAllContactsMessagesWithNoFilters,
);

router.get(
  '/messages/loadMoreAllContacts',
  verifyToken,
  checkRole(['admin', 'superAdmin', 'attendant']),
  ChatController.getAllContactsMessagesWithNoFilters,
);

export default router;
