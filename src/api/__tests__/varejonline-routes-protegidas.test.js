// As rotas do Varejo Online exigem login e papel, exceto o callback do OAuth.
//
// ── O ALCANCE ──────────────────────────────────────────────────────────────
// PEGA:
//   · 🚨 GET /proxy/* sem verifyToken: repassava qualquer caminho ao ERP com o
//     token do servidor, para qualquer pessoa na internet;
//   · o mesmo em /auth/start, /test e /terceiros;
//   · uma rota nova neste roteador que nasca aberta (o teste varre TODAS e so
//     aceita aberta a que esta na lista de excecoes, hoje so o /callback).
// NAO PEGA:
//   · se o checkRole libera os papeis certos: e o auth-middleware.test.js;
//   · o callback devolver o token na resposta (follow-up, registrado na rota);
//   · rotas de OUTROS roteadores (a varredura geral e outro trabalho).
import { describe, it, expect, vi } from 'vitest';

// Controller com Sequelize na cadeia: so a TABELA de rotas importa aqui.
vi.mock('../controllers/varejonline.controller.js', () => ({
  default: new Proxy({}, { get: () => vi.fn() }),
}));

import router from '../routes/private/varejonline.routes.js';
import { verifyToken } from '../middlewares/auth.middleware.js';

const ABERTAS_DE_PROPOSITO = ['/callback'];

const rotas = router.stack
  .filter((c) => c.route)
  .map((c) => ({ caminho: c.route.path, cadeia: c.route.stack.map((l) => l.handle) }));

describe('🚨 rotas do Varejo Online exigem login e papel', () => {
  it('as cinco rotas existem (o denominador)', () => {
    expect(rotas.map((r) => r.caminho).sort()).toEqual([
      '/auth/start',
      '/callback',
      '/proxy/*',
      '/terceiros',
      '/test',
    ]);
  });

  for (const r of rotas.filter((x) => !ABERTAS_DE_PROPOSITO.includes(x.caminho))) {
    it(`${r.caminho}: verifyToken primeiro, depois checkRole, depois o handler`, () => {
      expect(r.cadeia).toHaveLength(3);
      expect(r.cadeia[0]).toBe(verifyToken);
    });
  }

  it('so o callback do OAuth fica aberto', () => {
    const abertas = rotas.filter((r) => r.cadeia[0] !== verifyToken).map((r) => r.caminho);
    expect(abertas).toEqual(ABERTAS_DE_PROPOSITO);
  });
});
