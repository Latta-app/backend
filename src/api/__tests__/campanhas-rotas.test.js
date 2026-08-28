// A ORDEM das rotas de campanha.
//
// ── O ALCANCE ──────────────────────────────────────────────────────────────
// PEGA:
//   · 🚨 rota LITERAL registrada depois da rota com PARAMETRO que a engole. O
//     Express casa na ordem de registro, entao `GET /campaigns/templates`
//     registrada depois de `GET /campaigns/:id` cai no `:id` com
//     id="templates". Vira consulta de uuid invalido, e o operador ve a lista
//     de templates VAZIA sem erro nenhum na tela — o pior formato de defeito,
//     porque nada acusa;
//   · o mesmo para qualquer literal futura sob /campaigns.
// NAO PEGA:
//   · se o handler faz a coisa certa. Isso e dos guards de cada servico;
//   · se o gate de role esta certo — e o auth-middleware.test.js.
import { describe, it, expect, vi } from 'vitest';

// A cadeia rota -> controller -> service -> config/database instancia o
// Sequelize na importacao. Este teste olha so a TABELA de rotas.
vi.mock('../../config/database.js', () => ({ sequelize: { query: vi.fn(async () => []) } }));
vi.mock('../../utils/s3.js', () => ({ default: { uploadFile: vi.fn() } }));
vi.mock('../../config/postgres.js', () => ({ pgQuery: vi.fn(async () => []) }));

import router from '../routes/private/campaigns.routes.js';

/** As rotas na ordem em que o Express vai tentar casar. */
const rotas = router.stack
  .filter((c) => c.route)
  .map((c) => ({
    caminho: c.route.path,
    metodos: Object.keys(c.route.methods).map((m) => m.toUpperCase()),
  }));

const posicao = (metodo, caminho) =>
  rotas.findIndex((r) => r.caminho === caminho && r.metodos.includes(metodo));

describe('🚨 literal antes de parametro', () => {
  it('/campaigns/templates vem antes de /campaigns/:id', () => {
    const literal = posicao('GET', '/campaigns/templates');
    const parametro = posicao('GET', '/campaigns/:id');
    expect(literal).toBeGreaterThanOrEqual(0);
    expect(parametro).toBeGreaterThanOrEqual(0);
    // Se esta ordem inverter, a lista de templates fica vazia em silencio.
    expect(literal).toBeLessThan(parametro);
  });

  it('/campaigns/audience/preview vem antes de /campaigns/:id', () => {
    expect(posicao('POST', '/campaigns/audience/preview')).toBeLessThan(
      posicao('GET', '/campaigns/:id'),
    );
  });

  it('nenhuma outra literal de um segmento so cai depois do :id', () => {
    const doId = posicao('GET', '/campaigns/:id');
    const literaisDepois = rotas
      .slice(doId + 1)
      .map((r) => r.caminho)
      .filter((c) => /^\/campaigns\/[a-z-]+$/.test(c));
    expect(literaisDepois).toEqual([]);
  });
});

describe('as rotas do lote e do template existem', () => {
  it.each([
    ['POST', '/campaigns/:id/pieces'],
    ['GET', '/campaigns/:id/pieces'],
    ['PUT', '/campaigns/:id/pieces/:pieceId/revisao'],
    ['POST', '/campaigns/:id/production/approve'],
    ['GET', '/campaigns/templates'],
    ['GET', '/campaigns/:id/template'],
    ['PUT', '/campaigns/:id/template'],
    ['POST', '/campaigns/:id/template/preview'],
    ['POST', '/campaigns/briefing'],
    ['GET', '/campaigns/:id/pagina'],
    ['PUT', '/campaigns/:id/pagina'],
    ['POST', '/campaigns/:id/pagina/gerar'],
    ['POST', '/campaigns/:id/aprovacao'],
  ])('%s %s', (metodo, caminho) => {
    expect(posicao(metodo, caminho)).toBeGreaterThanOrEqual(0);
  });
});

describe('🚨 o agente nao tem rota que APLIQUE', () => {
  it('a unica rota do agente e um POST que devolve proposta', () => {
    const doAgente = rotas.filter((r) => /briefing/.test(r.caminho));
    expect(doAgente).toHaveLength(1);
    expect(doAgente[0].metodos).toEqual(['POST']);
  });

  it('🚨 congelar publico, aprovar direcao e disparar seguem em rotas PROPRIAS', () => {
    // O desenho inteiro do agente depende desta fronteira: ele preenche
    // formulario, e todo passo com consequencia continua exigindo a mao do
    // operador numa rota que o briefing nao chama.
    for (const caminho of [
      '/campaigns/:id/audience',
      '/campaigns/:id/production/approve',
      '/campaigns/:id/pieces',
    ]) {
      expect(posicao('POST', caminho)).toBeGreaterThanOrEqual(0);
    }
  });
});
