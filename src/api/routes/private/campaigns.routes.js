// Seção Campanhas do cockpit. Gate via JWT + roles 'admin'/'superAdmin' — o
// mesmo pattern de admin-scheduling-metrics.routes.js. Clínica não alcança:
// montar público de disparo é operação da Latta, não da clínica parceira.

import { Router } from 'express';
import {
  previewAudience,
  listCampaigns,
  getCampaign,
  createCampaign,
  updateCampaign,
  snapshotAudience,
  productionPreflight,
  getProduction,
  saveProduction,
  uploadBackground,
  generateSample,
  approveDirection,
  startBatch,
  listPieces,
  reviewPiece,
  listTemplates,
  getTemplate,
  saveTemplate,
  previewTemplate,
} from '../../controllers/campaigns.controller.js';
import { verifyToken, checkRole } from '../../middlewares/auth.middleware.js';

const router = Router();

router.use(verifyToken);
router.use(checkRole(['superAdmin', 'admin']));

// Read-only e sem campanha: monta o funil ao vivo a partir das regras. É o que
// a aba de Público usa a cada toque numa regra.
router.post('/campaigns/audience/preview', previewAudience);

router.get('/campaigns', listCampaigns);
router.post('/campaigns', createCampaign);
// 🚨 ESTA LINHA TEM QUE VIR ANTES DE /campaigns/:id, E A ORDEM E O BUG.
//
// O Express casa na ORDEM de registro. Registrada depois, `GET
// /campaigns/templates` cai em `GET /campaigns/:id` com id="templates": vira
// consulta de uuid invalido, e o operador ve a lista de templates vazia sem
// erro nenhum na tela. O catalogo nao e por campanha — todas escolhem do mesmo
// — entao a rota e literal, e literal antes de parametro. Guard em
// campanhas-rotas.test.js.
router.get('/campaigns/templates', listTemplates);

router.get('/campaigns/:id', getCampaign);
router.put('/campaigns/:id', updateCampaign);
router.post('/campaigns/:id/audience', snapshotAudience);

// Producao: a peca-modelo. A conferencia pre-voo e sobre o LOTE e fica separada.
router.get('/campaigns/:id/production', getProduction);
router.put('/campaigns/:id/production', saveProduction);
router.post('/campaigns/:id/production/background', uploadBackground);
// 🚨 Gera UMA peca, nao o lote. Errar a direcao aqui custa uma inferencia.
router.post('/campaigns/:id/production/sample', generateSample);

// A conferencia pre-voo. Read-only, nao gera nada: ela diz o que trava o LOTE.
router.get('/campaigns/:id/production/preflight', productionPreflight);

// 🚨 Congela QUAL amostra foi aprovada e a receita que a produziu. Sem esta
// linha o lote nao tem o que replicar.
router.post('/campaigns/:id/production/approve', approveDirection);

// ── O LOTE ─────────────────────────────────────────────────────────────────
// 🚨 O POST dispara e VOLTA. Sao ~69 pecas a ~20s cada com concorrencia 3, o
// que nao cabe num request: o estado mora na tabela e a tela le pelo GET.
router.post('/campaigns/:id/pieces', startBatch);
router.get('/campaigns/:id/pieces', listPieces);

// O veredito humano sobre uma peca. E a unica checagem que pega o cachorro
// errado e a palavra escrita errado.
router.put('/campaigns/:id/pieces/:pieceId/revisao', reviewPiece);

// ── TEMPLATE ───────────────────────────────────────────────────────────────
router.get('/campaigns/:id/template', getTemplate);
router.put('/campaigns/:id/template', saveTemplate);
// 🚨 A previa do que cada casa vai LER. Read-only, nao manda nada: variavel
// errada so aparece depois do disparo, e casa sem genero cadastrado fica
// bloqueada aqui em vez de receber o pronome errado.
router.post('/campaigns/:id/template/preview', previewTemplate);

export default router;
