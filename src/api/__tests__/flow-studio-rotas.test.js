// As rotas do Estúdio de Flows: ORDEM, PRESENÇA e o GATE de role.
//
// ── O ALCANCE ──────────────────────────────────────────────────────────────
// PEGA:
//   · 🚨 rota LITERAL registrada depois da rota com PARÂMETRO que a engole
//     (mesmo método, mesmo prefixo). O Express casa na ordem de registro, e o
//     nome da rota vira o id — o defeito que campanhas-rotas.test.js guarda pra
//     /campaigns, aqui pra /flows e /edits;
//   · o gate saindo de alguma rota: sem token → 401; clínica e tutor → 403;
//     admin e superAdmin passam. Exercitado por HTTP de verdade, pelo router
//     real e pelo verifyToken/checkRole reais;
//   · uma rota que deixasse o operador mudar o status pra outra coisa que não
//     "descartada" (só existe o PATCH, e ele recusa o resto).
// NÃO PEGA:
//   · o que cada handler faz com o banco. É o flow-studio-pedidos.test.js.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import { httpRequest, adminToken, superAdminToken, clinicToken, petOwnerToken } from './helpers.js';
import router from '../routes/private/flow-studio.routes.js';

// O vi.mock é içado acima dos imports; o `query` só é LIDO quando uma rota
// chama o banco, então a closure enxerga a const já definida.
const query = vi.fn(async () => []);
vi.mock('../../config/database.js', () => ({ sequelize: { query: (...a) => query(...a) } }));

/** As rotas na ordem em que o Express vai tentar casar. */
const rotas = router.stack
  .filter((c) => c.route)
  .map((c) => ({
    caminho: c.route.path,
    metodos: Object.keys(c.route.methods).map((m) => m.toUpperCase()),
  }));

const posicao = (metodo, caminho) =>
  rotas.findIndex((r) => r.caminho === caminho && r.metodos.includes(metodo));

describe('as rotas existem', () => {
  it.each([
    ['GET', '/flows'],
    ['GET', '/flows/:flowKey'],
    ['GET', '/edits'],
    ['POST', '/edits'],
    ['PATCH', '/edits/:id'],
    ['POST', '/simular'],
  ])('%s %s', (metodo, caminho) => {
    expect(posicao(metodo, caminho)).toBeGreaterThanOrEqual(0);
  });

  // A sexta é a SIMULAÇÃO por número: lê a tela como um telefone, não grava
  // nada (a trava mora nas EFs). Fica atrás do mesmo gate de admin.
  it('são só essas seis (nada de DELETE nem de PUT de status)', () => {
    expect(rotas.flatMap((r) => r.metodos.map((m) => `${m} ${r.caminho}`)).sort()).toEqual([
      'GET /edits',
      'GET /flows',
      'GET /flows/:flowKey',
      'PATCH /edits/:id',
      'POST /edits',
      'POST /simular',
    ]);
  });
});

describe('🚨 literal antes de parâmetro', () => {
  it('nenhuma rota literal de um segmento cai depois do :param do mesmo prefixo e método', () => {
    const atrasadas = [];
    rotas.forEach((r, i) => {
      const comParametro = r.caminho.match(/^(\/[a-z-]+)\/:[A-Za-z]+$/);
      if (!comParametro) return;
      const prefixo = comParametro[1];
      rotas.slice(i + 1).forEach((depois) => {
        const literal = new RegExp(`^${prefixo}/[a-z-]+$`).test(depois.caminho);
        const mesmoMetodo = depois.metodos.some((m) => r.metodos.includes(m));
        if (literal && mesmoMetodo) atrasadas.push(`${depois.metodos} ${depois.caminho}`);
      });
    });
    expect(atrasadas).toEqual([]);
  });

  it('o guard enxerga a forma que ele existe pra pegar (controle positivo)', () => {
    // Sem isto o guard acima poderia passar por nunca casar nada.
    const montada = express.Router();
    montada.get('/flows/:flowKey', () => {});
    montada.get('/flows/resumo', () => {});
    const caminhos = montada.stack.map((c) => c.route.path);
    const doParam = caminhos.indexOf('/flows/:flowKey');
    expect(caminhos.slice(doParam + 1).filter((c) => /^\/flows\/[a-z-]+$/.test(c))).toEqual([
      '/flows/resumo',
    ]);
  });
});

describe('🚨 o gate: verifyToken + checkRole(admin, superAdmin) em TODA rota', () => {
  let app;
  beforeEach(() => {
    query.mockReset();
    query.mockImplementation(async () => []);
    app = express();
    app.use(express.json());
    app.use('/api/flow-studio', router);
  });

  const chamadas = [
    ['GET', '/api/flow-studio/flows', undefined],
    ['GET', '/api/flow-studio/flows/flow-features', undefined],
    ['GET', '/api/flow-studio/edits', undefined],
    ['POST', '/api/flow-studio/edits', { flowKey: 'flow-features', edits: [] }],
    [
      'PATCH',
      '/api/flow-studio/edits/11111111-2222-4333-8444-555555555555',
      { status: 'descartada' },
    ],
    // Flow sem simulação: o handler responde 400 sem chamar EF nenhuma.
    ['POST', '/api/flow-studio/simular', { flowKey: 'flow-b2b-agenda-v1' }],
  ];

  it.each(chamadas)('%s %s sem token → 401', async (method, path, body) => {
    const res = await httpRequest(app, { method, path, body });
    expect(res.status).toBe(401);
    expect(query).not.toHaveBeenCalled();
  });

  it.each(chamadas)('%s %s com token de CLÍNICA → 403', async (method, path, body) => {
    const res = await httpRequest(app, { method, path, body, token: clinicToken() });
    expect(res.status).toBe(403);
    expect(query).not.toHaveBeenCalled();
  });

  it.each(chamadas)('%s %s com token de TUTOR → 403', async (method, path, body) => {
    const res = await httpRequest(app, { method, path, body, token: petOwnerToken() });
    expect(res.status).toBe(403);
    expect(query).not.toHaveBeenCalled();
  });

  // Passar do gate = o HANDLER respondeu (todo código dele começa com
  // FLOW_STUDIO_). Um 404 do próprio Express também "não seria 401/403", e
  // leria como gate aberto numa rota que sumiu.
  it.each(chamadas)('%s %s com admin chega no handler', async (method, path, body) => {
    const res = await httpRequest(app, { method, path, body, token: adminToken() });
    expect([401, 403]).not.toContain(res.status);
    expect(res.body?.code).toMatch(/^FLOW_STUDIO_/);
  });

  it.each(chamadas)('%s %s com superAdmin chega no handler', async (method, path, body) => {
    const res = await httpRequest(app, { method, path, body, token: superAdminToken() });
    expect([401, 403]).not.toContain(res.status);
    expect(res.body?.code).toMatch(/^FLOW_STUDIO_/);
  });
});
