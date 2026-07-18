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
  '/messages/getAllContactsBeingAttended',
  verifyToken,
  checkRole(['admin', 'superAdmin', 'attendant']),
  ChatController.getAllContactsBeingAttended,
);

router.get(
  '/messages/getAllTestContacts',
  verifyToken,
  checkRole(['admin', 'superAdmin', 'attendant']),
  ChatController.getAllTestContacts,
);

router.get(
  '/messages/getTestContactsCount',
  verifyToken,
  checkRole(['admin', 'superAdmin', 'attendant']),
  ChatController.getTestContactsCount,
);

// Aba B2B: contacts de clinicas (chat path 'merchant-scheduling-agent|%')
router.get(
  '/messages/getAllB2bContacts',
  verifyToken,
  checkRole(['admin', 'superAdmin', 'attendant']),
  ChatController.getAllB2bContacts,
);

router.get(
  '/messages/getB2bContactsCount',
  verifyToken,
  checkRole(['admin', 'superAdmin', 'attendant']),
  ChatController.getB2bContactsCount,
);

// Aba Testers: humanos reais na whitelist staging_users (sócios testando em
// prod com o próprio número). São excluídos das outras abas pelo filtro de
// environment — até então só o Debug Mode os alcançava.
router.get(
  '/messages/getAllTesterContacts',
  verifyToken,
  checkRole(['admin', 'superAdmin', 'attendant']),
  ChatController.getAllTesterContacts,
);

router.get(
  '/messages/getTesterContactsCount',
  verifyToken,
  checkRole(['admin', 'superAdmin', 'attendant']),
  ChatController.getTesterContactsCount,
);

// Badge da aba "Luma" no painel — conta contacts.is_being_attended=true.
router.get(
  '/messages/getInAttendanceContactsCount',
  verifyToken,
  checkRole(['admin', 'superAdmin', 'attendant']),
  ChatController.getInAttendanceContactsCount,
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
  '/messages/getContactByContactId/:contact_id',
  verifyToken,
  checkRole(['admin', 'superAdmin', 'attendant']),
  ChatController.getContactByContactId,
);

router.get(
  '/messages/orders/by-contact/:contact_id',
  verifyToken,
  checkRole(['admin', 'superAdmin', 'attendant']),
  ChatController.getOrdersByContactId,
);

// Retrato de valor do cliente (visão Métricas do painel direito) — RPC
// get_client_metrics no Supabase. Issues 04/05 de
// docs/issues/mensageria-metricas-e-moods/ (monorepo).
router.get(
  '/messages/metrics/by-contact/:contact_id',
  verifyToken,
  checkRole(['admin', 'superAdmin', 'attendant']),
  ChatController.getClientMetricsByContactId,
);

router.get(
  '/messages/getContactByPetOwnerIdOrPhone',
  verifyToken,
  checkRole(['admin', 'superAdmin', 'attendant']),
  ChatController.getContactByPetOwnerIdOrPhone,
);

router.get(
  '/messages/loadMore/:pet_owner_id',
  verifyToken,
  checkRole(['admin', 'superAdmin', 'attendant']),
  ChatController.getContactByPetOwnerId,
);

// Marca mensagens não-respondidas de um pet_owner como answered (substitui
// o webhook N8n `is_answered` em Lattinha - Webhooks Front).
router.post(
  '/messages/markAsAnswered',
  verifyToken,
  checkRole(['admin', 'superAdmin', 'attendant']),
  ChatController.markAsAnswered,
);

// Resumo de dias com mensagens — alimenta date picker da mensageria.
// Query: ?pet_owner_id=X OU ?contact_id=Y
router.get(
  '/messages/daysSummary',
  verifyToken,
  checkRole(['admin', 'superAdmin', 'attendant']),
  ChatController.getMessagesDaysSummary,
);

export default router;
