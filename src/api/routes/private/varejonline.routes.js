import { Router } from 'express';
import VarejonlineController from '../../controllers/varejonline.controller.js';
import { verifyToken, checkRole } from '../../middlewares/auth.middleware.js';

const router = Router();

// O /proxy repassa QUALQUER caminho ao ERP com o token do servidor, e as demais
// rotas gastam o limitador de chamadas compartilhado: sem login, qualquer pessoa
// lia o ERP da Latta. So admin e superAdmin usam. Nenhum cliente conhecido
// (frontend, funcoes de borda, n8n do repositorio) chama estas rotas.
const soAdmin = [verifyToken, checkRole(['admin', 'superAdmin'])];

// Rota para iniciar o processo de autorização OAuth
router.get('/auth/start', ...soAdmin, VarejonlineController.startAuth);

// Callback do OAuth (essa URL foi cadastrada no DevCenter). FICA ABERTA de
// proposito: quem chama e o navegador redirecionado pelo Varejo Online, sem
// cabecalho Authorization. Ainda devolve o token na resposta: follow-up.
router.get('/callback', VarejonlineController.handleCallback);

// Rota para testar se o token está funcionando
router.get('/test', ...soAdmin, VarejonlineController.testAPI);

// Rota para listar terceiros (exemplo de uso da API)
router.get('/terceiros', ...soAdmin, VarejonlineController.getTerceiros);

router.get('/proxy/*', ...soAdmin, VarejonlineController.proxyRequest);

export default router;
