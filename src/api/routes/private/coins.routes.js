import { Router } from 'express';
import CoinsController from '../../controllers/coins.controller.js';
import { verifyToken, checkRole } from '../../middlewares/auth.middleware.js';

const router = Router();

// Extrato de lattinhas do tutor — alimenta a visão "Lattinhas" do painel direito
// da mensageria. Ref: docs/issues/painel-lattinhas/ (repo Latta).
//
// 🚨 ADMIN-ONLY, e isso não é excesso de zelo. A economia de lattinhas é interna
// da Latta: valor de tarifa, natureza contábil (cashback × engajamento) e ajuste
// manual da equipe. Role `clinic` não tem o que fazer aqui, e `petOwner` veria o
// próprio extrato por um caminho que não foi desenhado pra ele (o Shop é a tela
// do tutor). Rota de leitura ampla sem scoping é exatamente o que a nota do
// `scheduling.routes.js` já registra como vazamento.
router.get(
  '/pet-owner/:petOwnerId',
  verifyToken,
  checkRole(['admin', 'superAdmin']),
  CoinsController.getByPetOwner,
);

export default router;
