import { Router } from 'express';
import MarketplaceConnectionController from '../../controllers/marketplace-connection.controller.js';
import { verifyToken, checkRole } from '../../middlewares/auth.middleware.js';

const router = Router();

// Conexão do tutor com os marketplaces parceiros (hoje só a Petz), exposta no
// painel da mensageria. Mesma faixa de papéis das rotas de mensageria — quem
// atende a conversa precisa ver o estado da conexão e conseguir reenviar o
// código. A RPC por trás NÃO devolve CPF nem token, então não há PII em claro
// aqui (diferente de /pet-owner, que é admin-only por isso).
const MESSAGING_ROLES = checkRole(['admin', 'superAdmin', 'attendant']);

router.get('/:phone', verifyToken, MESSAGING_ROLES, MarketplaceConnectionController.getConnection);

router.post(
  '/:phone/send-code',
  verifyToken,
  MESSAGING_ROLES,
  MarketplaceConnectionController.sendCode,
);

export default router;
