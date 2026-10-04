// Estúdio de Flows: o que cada handler manda pro banco e devolve pra tela.
//
// ── O ALCANCE ──────────────────────────────────────────────────────────────
// PEGA:
//   · 🚨 o lote do POST deixando de ser UM: todos os pedidos de um envio
//     precisam do MESMO lote_id, e dois envios nunca podem compartilhar. É por
//     ele que a sessão que aplica sabe o que foi pedido junto;
//   · 🚨 o autor vindo do CORPO em vez do JWT (qualquer um se passaria por
//     qualquer um);
//   · pedido inválido chegando no banco (o 400 tem que sair antes do INSERT);
//   · valor jsonb indo cru (objeto/array) em vez de JSON serializado;
//   · o descarte virando "muda pra qualquer status", ou checando o status
//     num SELECT separado (a condição tem que estar no WHERE do UPDATE);
//   · 404 × 409 trocados no descarte;
//   · a lista de Flows trazendo o flow_json (megabytes de base64) ou perdendo a
//     ordem com o e-commerce no topo.
// NÃO PEGA:
//   · se o Postgres aceita o SQL. Os replacements são conferidos aqui; a sintaxe
//     do INSERT foi provada uma vez contra um Postgres real (ver a PR).
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import { httpRequest, adminToken } from './helpers.js';
import router from '../routes/private/flow-studio.routes.js';

const query = vi.fn(async () => []);
vi.mock('../../config/database.js', () => ({ sequelize: { query: (...a) => query(...a) } }));

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const AUTOR = { id: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee', email: 'operador@latta.app.br' };
const SNAPSHOT = '11111111-2222-4333-8444-555555555555';
const EDIT_ID = '99999999-8888-4777-8666-555555555555';

let app;
beforeEach(() => {
  query.mockReset();
  query.mockImplementation(async () => []);
  app = express();
  app.use(express.json({ limit: '20mb' }));
  app.use('/api/flow-studio', router);
});

/** O SQL da última chamada ao banco. */
const sql = () => query.mock.calls.at(-1)[0];

const chamar = (method, path, body) =>
  httpRequest(app, { method, path, body, token: adminToken(AUTOR) });

const corpoDeTres = () => ({
  flowKey: 'flow-features',
  snapshotId: SNAPSHOT,
  edits: [
    {
      screenId: 'WELCOME',
      componentPath: 'layout.children[0]',
      componentType: 'TextBody',
      rotulo: 'Título',
      tipo: 'texto',
      propriedade: 'text',
      origem: 'flow',
      valorAntes: 'Oi',
      valorNovo: ['linha 1', 'linha 2'],
      nota: 'mais curto',
    },
    {
      screenId: 'HOME',
      tipo: 'comentario',
      origem: 'servidor',
      campoServidor: 'home_title',
      nota: 'esse título vem da EF',
    },
    {
      screenId: 'CART',
      tipo: 'imagem',
      origem: 'flow',
      valorAntes: { src: 'antigo' },
      valorNovo: 'data:image/png;base64,iVBORw0KGgo=',
    },
  ],
});

describe('POST /edits — o lote', () => {
  beforeEach(() => {
    query.mockImplementation(async () => [{ id: 'id-0' }, { id: 'id-1' }, { id: 'id-2' }]);
  });

  it('201 com o loteId e os ids que o banco devolveu', async () => {
    const res = await chamar('POST', '/api/flow-studio/edits', corpoDeTres());
    expect(res.status).toBe(201);
    expect(res.body.code).toBe('FLOW_STUDIO_EDITS_CREATED');
    expect(res.body.data.ids).toEqual(['id-0', 'id-1', 'id-2']);
    expect(res.body.data.loteId).toMatch(UUID_RE);
  });

  it('🚨 UM statement, com UM lote_id pra todos os pedidos — e é o que a resposta devolve', async () => {
    const res = await chamar('POST', '/api/flow-studio/edits', corpoDeTres());
    expect(query).toHaveBeenCalledTimes(1);
    const [doInsert, opts] = query.mock.calls[0];
    expect(doInsert).toMatch(/INSERT INTO flow_studio_edits/);
    expect(doInsert).toMatch(/RETURNING id/);
    // Uma tupla por pedido, todas apontando pro MESMO replacement de lote.
    expect(doInsert.match(/\(:loteId,/g)).toHaveLength(3);
    expect(Object.keys(opts.replacements).filter((k) => /^loteId/.test(k))).toEqual(['loteId']);
    expect(opts.replacements.loteId).toMatch(UUID_RE);
    expect(opts.replacements.loteId).toBe(res.body.data.loteId);
  });

  it('🚨 dois envios nunca compartilham lote', async () => {
    const a = await chamar('POST', '/api/flow-studio/edits', corpoDeTres());
    const b = await chamar('POST', '/api/flow-studio/edits', corpoDeTres());
    expect(a.body.data.loteId).not.toBe(b.body.data.loteId);
    expect(query.mock.calls[0][1].replacements.loteId).not.toBe(
      query.mock.calls[1][1].replacements.loteId,
    );
  });

  it('🚨 o autor sai do JWT (id + e-mail), e o corpo não consegue se passar por outro', async () => {
    const corpo = { ...corpoDeTres(), autorId: 'intruso', autorNome: 'Fulano' };
    corpo.edits[0].autorId = 'intruso';
    await chamar('POST', '/api/flow-studio/edits', corpo);
    const { replacements } = query.mock.calls[0][1];
    expect(replacements.autorId).toBe(AUTOR.id);
    expect(replacements.autorNome).toBe(AUTOR.email);
    expect(
      Object.keys(replacements)
        .filter((k) => /^autor/.test(k))
        .sort(),
    ).toEqual(['autorId', 'autorNome']);
  });

  it('os campos de cada pedido entram indexados, e o jsonb vai SERIALIZADO', async () => {
    await chamar('POST', '/api/flow-studio/edits', corpoDeTres());
    const { replacements: r } = query.mock.calls[0][1];
    expect(r.flowKey).toBe('flow-features');
    expect(r.snapshotId).toBe(SNAPSHOT);
    expect(r.screenId0).toBe('WELCOME');
    expect(r.tipo0).toBe('texto');
    expect(r.valorNovo0).toBe(JSON.stringify(['linha 1', 'linha 2']));
    expect(r.valorAntes0).toBe(JSON.stringify('Oi'));
    expect(r.nota0).toBe('mais curto');
    // pedido 1: comentário de servidor, sem valor nenhum
    expect(r.origem1).toBe('servidor');
    expect(r.campoServidor1).toBe('home_title');
    expect(r.valorAntes1).toBeNull();
    expect(r.valorNovo1).toBeNull();
    expect(r.componentPath1).toBeNull();
    // pedido 2: imagem
    expect(r.valorAntes2).toBe(JSON.stringify({ src: 'antigo' }));
    expect(r.valorNovo2).toBe(JSON.stringify('data:image/png;base64,iVBORw0KGgo='));
    expect(sql()).toMatch(/:valorNovo2::jsonb/);
  });

  it('sem snapshotId grava NULL', async () => {
    const corpo = corpoDeTres();
    delete corpo.snapshotId;
    await chamar('POST', '/api/flow-studio/edits', corpo);
    expect(query.mock.calls[0][1].replacements.snapshotId).toBeNull();
  });

  it('🚨 pedido inválido: 400 com índice e campo, e o banco NÃO é tocado', async () => {
    const corpo = corpoDeTres();
    corpo.edits[1].campoServidor = '';
    const res = await chamar('POST', '/api/flow-studio/edits', corpo);
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({
      code: 'FLOW_STUDIO_PEDIDO_INVALIDO',
      indice: 1,
      campo: 'campoServidor',
    });
    expect(res.body.message).toMatch(/^edits\[1\]\.campoServidor:/);
    expect(query).not.toHaveBeenCalled();
  });

  it('erro do banco vira 500 com a mensagem', async () => {
    query.mockImplementation(async () => {
      throw new Error('relation "flow_studio_edits" does not exist');
    });
    const res = await chamar('POST', '/api/flow-studio/edits', corpoDeTres());
    expect(res.status).toBe(500);
    expect(res.body).toMatchObject({ code: 'FLOW_STUDIO_ERROR' });
  });
});

describe('PATCH /edits/:id — só DESCARTAR, e só pendente', () => {
  const linha = { id: EDIT_ID, status: 'descartada', lote_id: 'l', valor_novo: 'x' };

  it('200 com o pedido em camelCase quando estava pendente', async () => {
    query.mockImplementationOnce(async () => [linha]);
    const res = await chamar('PATCH', `/api/flow-studio/edits/${EDIT_ID}`, {
      status: 'descartada',
    });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ id: EDIT_ID, status: 'descartada', loteId: 'l' });
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('🚨 a condição de pendente mora no WHERE do UPDATE, e o updated_at anda', async () => {
    query.mockImplementationOnce(async () => [linha]);
    await chamar('PATCH', `/api/flow-studio/edits/${EDIT_ID}`, { status: 'descartada' });
    const [primeiro, opts] = query.mock.calls[0];
    expect(primeiro).toMatch(/^\s*UPDATE flow_studio_edits/);
    expect(primeiro).toMatch(/WHERE id = :id AND status = 'pendente'/);
    expect(primeiro).toMatch(/updated_at = NOW\(\)/);
    expect(opts.replacements).toEqual({ id: EDIT_ID });
  });

  it('404 quando o pedido não existe', async () => {
    query.mockImplementationOnce(async () => []).mockImplementationOnce(async () => []);
    const res = await chamar('PATCH', `/api/flow-studio/edits/${EDIT_ID}`, {
      status: 'descartada',
    });
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('FLOW_STUDIO_EDIT_NOT_FOUND');
  });

  it('409 quando existe mas não está pendente', async () => {
    query
      .mockImplementationOnce(async () => [])
      .mockImplementationOnce(async () => [{ status: 'em_andamento' }]);
    const res = await chamar('PATCH', `/api/flow-studio/edits/${EDIT_ID}`, {
      status: 'descartada',
    });
    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({
      code: 'FLOW_STUDIO_EDIT_NAO_PENDENTE',
      status: 'em_andamento',
    });
  });

  it.each([['aplicada'], ['pendente'], ['em_andamento'], [undefined]])(
    '🚨 status %s no corpo → 400, sem tocar o banco',
    async (status) => {
      const res = await chamar('PATCH', `/api/flow-studio/edits/${EDIT_ID}`, { status });
      expect(res.status).toBe(400);
      expect(query).not.toHaveBeenCalled();
    },
  );

  it('id que não é uuid → 400, sem tocar o banco', async () => {
    const res = await chamar('PATCH', '/api/flow-studio/edits/abc', { status: 'descartada' });
    expect(res.status).toBe(400);
    expect(query).not.toHaveBeenCalled();
  });
});

describe('GET /edits — filtros', () => {
  it('sem filtro: sem WHERE, mais novo primeiro, limite 500', async () => {
    await chamar('GET', '/api/flow-studio/edits');
    expect(sql()).not.toMatch(/WHERE/);
    expect(sql()).toMatch(/ORDER BY created_at DESC\s+LIMIT 500/);
  });

  it('flowKey e lista de status', async () => {
    await chamar(
      'GET',
      '/api/flow-studio/edits?flowKey=flow-features&status=pendente,em_andamento',
    );
    expect(sql()).toMatch(/WHERE flow_key = :flowKey AND status IN \(:status\)/);
    expect(query.mock.calls[0][1].replacements).toEqual({
      flowKey: 'flow-features',
      status: ['pendente', 'em_andamento'],
    });
  });

  it('🚨 status desconhecido → 400, não lista vazia', async () => {
    const res = await chamar('GET', '/api/flow-studio/edits?status=aprovada');
    expect(res.status).toBe(400);
    expect(query).not.toHaveBeenCalled();
  });

  it('cada item sai em camelCase', async () => {
    query.mockImplementationOnce(async () => [
      { id: EDIT_ID, lote_id: 'l', screen_id: 'WELCOME', campo_servidor: null, pr_url: null },
    ]);
    const res = await chamar('GET', '/api/flow-studio/edits');
    expect(res.body.code).toBe('FLOW_STUDIO_EDITS');
    expect(res.body.data[0]).toMatchObject({ id: EDIT_ID, loteId: 'l', screenId: 'WELCOME' });
    expect(res.body.data[0]).not.toHaveProperty('screen_id');
  });
});

describe('GET /flows e /flows/:flowKey', () => {
  it('🚨 a lista não pede o flow_json e usa DISTINCT ON por flow', async () => {
    await chamar('GET', '/api/flow-studio/flows');
    expect(sql()).toMatch(/DISTINCT ON \(flow_key\)/);
    expect(sql()).toMatch(/ORDER BY flow_key, created_at DESC/);
    expect(sql()).not.toMatch(/flow_json/);
  });

  it('e-commerce primeiro, depois por nome', async () => {
    // O banco devolve por flow_key; a ordem da tela é outra.
    query.mockImplementationOnce(async () => [
      {
        id: 'c',
        flow_key: 'flow-assinatura',
        nome: 'Assinatura',
        git_sha: 'g3',
        telas: 4,
        created_at: 't3',
      },
      {
        id: 'a',
        flow_key: 'flow-features',
        nome: 'E-commerce',
        git_sha: 'g1',
        telas: 88,
        created_at: 't1',
      },
      {
        id: 'b',
        flow_key: 'flow-onboarding-v2',
        nome: 'Onboarding',
        git_sha: 'g2',
        telas: 46,
        created_at: 't2',
      },
    ]);
    const res = await chamar('GET', '/api/flow-studio/flows');
    expect(res.body.code).toBe('FLOW_STUDIO_FLOWS');
    expect(res.body.data.map((f) => f.flowKey)).toEqual([
      'flow-features',
      'flow-assinatura',
      'flow-onboarding-v2',
    ]);
    expect(res.body.data[0]).toEqual({
      snapshotId: 'a',
      flowKey: 'flow-features',
      nome: 'E-commerce',
      gitSha: 'g1',
      telas: 88,
      createdAt: 't1',
    });
  });

  it('um flow: o mais recente, com o json', async () => {
    query.mockImplementationOnce(async () => [
      { id: 's', flow_key: 'flow-features', flow_json: { version: '7.2' } },
    ]);
    const res = await chamar('GET', '/api/flow-studio/flows/flow-features');
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ snapshotId: 's', flowJson: { version: '7.2' } });
    expect(sql()).toMatch(/WHERE flow_key = :flowKey\s+ORDER BY created_at DESC\s+LIMIT 1/);
    expect(query.mock.calls[0][1].replacements).toEqual({ flowKey: 'flow-features' });
  });

  it('flow sem snapshot → 404', async () => {
    const res = await chamar('GET', '/api/flow-studio/flows/nao-existe');
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('FLOW_STUDIO_FLOW_NOT_FOUND');
  });
});
