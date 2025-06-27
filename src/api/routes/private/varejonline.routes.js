import { Router } from 'express';
import VarejonlineController from '../../controllers/varejonline.controller.js';

const router = Router();

// Rota para iniciar o processo de autorização OAuth
router.get('/auth/start', VarejonlineController.startAuth);

// Rota de callback do OAuth (essa URL foi cadastrada no DevCenter)
router.get('/callback', VarejonlineController.handleCallback);

// Rota para testar se o token está funcionando
router.get('/test', VarejonlineController.testAPI);

// Rota para listar terceiros (exemplo de uso da API)
router.get('/terceiros', VarejonlineController.getTerceiros);

export default router;
