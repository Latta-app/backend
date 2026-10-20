// As quatro rotas que CRIAM usuario exigem login e papel.
//
// ── O ALCANCE ──────────────────────────────────────────────────────────────
// PEGA:
//   · 🚨 POST /users/create-admin (e create-veterinary, create-pet-owner,
//     create-user) registrada sem verifyToken e checkRole: era aberta, e
//     qualquer pessoa na internet criava um admin;
//   · o mesmo para uma rota de criacao nova que alguem some a este roteador
//     (o teste varre TODAS as rotas POST /create-*).
// NAO PEGA:
//   · se o checkRole libera os papeis certos: e o auth-middleware.test.js;
//   · rotas de criacao em OUTROS roteadores. O varredor so olha este arquivo.
import { describe, it, expect, vi } from 'vitest';

// A cadeia rota -> controller -> service -> repositorio -> modelos instancia o
// Sequelize na importacao. Este teste olha so a TABELA de rotas, entao o
// controller vira um painel de funcoes falsas (qualquer nome vira vi.fn()).
vi.mock('../controllers/user.controller.js', () => ({
  default: new Proxy({}, { get: () => vi.fn() }),
}));

import router from '../routes/private/user.routes.js';
import { verifyToken } from '../middlewares/auth.middleware.js';

const criacao = router.stack
  .filter((c) => c.route && c.route.methods.post && /^\/create-/.test(c.route.path))
  .map((c) => ({ caminho: c.route.path, cadeia: c.route.stack.map((l) => l.handle) }));

describe('🚨 criar usuario exige login e papel', () => {
  it('as quatro rotas de criacao existem (o denominador)', () => {
    expect(criacao.map((r) => r.caminho).sort()).toEqual([
      '/create-admin',
      '/create-pet-owner',
      '/create-user',
      '/create-veterinary',
    ]);
  });

  for (const nome of ['/create-admin', '/create-veterinary', '/create-pet-owner', '/create-user']) {
    it(`${nome}: verifyToken primeiro, depois checkRole, depois o handler`, () => {
      const r = criacao.find((x) => x.caminho === nome);
      expect(r.cadeia).toHaveLength(3);
      expect(r.cadeia[0]).toBe(verifyToken);
    });
  }
});
