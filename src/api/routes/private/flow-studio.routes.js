// Estúdio de Flows do cockpit. Gate via JWT + roles 'admin'/'superAdmin' — o
// mesmo pattern de campaigns.routes.js. Clínica não alcança: pedir mudança de
// tela do WhatsApp Flow é operação da Latta.
//
// Montado em privateRoutes.js sob `/flow-studio`, então os caminhos aqui são
// relativos a `/api/flow-studio`.

import { Router } from 'express';
import {
  listarFlows,
  lerFlow,
  listarPedidos,
  criarPedidos,
  descartarPedido,
} from '../../controllers/flow-studio.controller.js';
import { verifyToken, checkRole } from '../../middlewares/auth.middleware.js';

const router = Router();

router.use(verifyToken);
router.use(checkRole(['superAdmin', 'admin']));

// 🚨 Literal antes de parâmetro, sempre. O Express casa na ORDEM de registro:
// uma rota literal nova sob /flows ou /edits registrada DEPOIS do `:param` cai
// nele com o nome da rota no lugar do id. Guard em flow-studio-rotas.test.js.
router.get('/flows', listarFlows);
router.get('/flows/:flowKey', lerFlow);

router.get('/edits', listarPedidos);
router.post('/edits', criarPedidos);
// O operador só DESCARTA. Andar com o pedido é da sessão que aplica.
router.patch('/edits/:id', descartarPedido);

export default router;
