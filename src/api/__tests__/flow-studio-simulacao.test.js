// A simulação por número do Estúdio de Flows: pra qual EF vai, com que token,
// e o que o controller manda pra ela.
//
// ── O ALCANCE ──────────────────────────────────────────────────────────────
// PEGA: Flow sem simulação recusado; telefone/modo/simId/ação tortos; o token
//   reaproveitado só quando é DESTE Flow e DESTE telefone (o braço do onboarding
//   sai do formato); o header `x-estudio-simulacao` e a service_role indo pra EF.
// NÃO PEGA: a trava em si — ela mora nas EFs (repo Latta,
//   `_shared/estudio-simulacao.test.ts`).
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../config/database.js', () => ({ sequelize: { query: vi.fn(async () => []) } }));

import {
  montarSimulacao,
  tokenNovo,
  tokenServe,
} from '../services/flow-studio-simulacao.service.js';
import { simular } from '../controllers/flow-studio.controller.js';

const base = {
  flowKey: 'flow-features',
  phone: '5531997244887',
  modo: 'leitura',
  simId: 'sim-12345678',
  pedido: { action: 'INIT' },
};

describe('montarSimulacao', () => {
  it('monta o pedido decifrado com token novo do formato do Flow', () => {
    const m = montarSimulacao(base, 1700000000000);
    expect(m.ok).toBe(true);
    expect(m.ef).toBe('marketplace-service');
    expect(m.flowToken).toBe('MARKETPLACE_1700000000000_5531997244887');
    expect(m.corpo).toEqual({
      simId: 'sim-12345678',
      pedido: { version: '3.0', action: 'INIT', data: {}, flow_token: m.flowToken },
    });
  });

  it('o braço do onboarding sai do formato do token', () => {
    expect(montarSimulacao({ ...base, flowKey: 'flow-onboarding-v2' }, 1).flowToken).toBe(
      'ONBOARDING_1_5531997244887',
    );
    expect(montarSimulacao({ ...base, flowKey: 'flow-onboarding-v2b' }, 1).flowToken).toBe(
      'ONBOARDING_B_1_5531997244887',
    );
  });

  it('reaproveita o token só se é deste Flow e deste telefone', () => {
    const t = tokenNovo('flow-onboarding-v2', '5531997244887', 42);
    expect(tokenServe('flow-onboarding-v2', '5531997244887', t)).toBe(true);
    expect(tokenServe('flow-onboarding-v2b', '5531997244887', t)).toBe(false);
    expect(tokenServe('flow-onboarding-v2', '5531999999999', t)).toBe(false);
    const m = montarSimulacao({ ...base, flowKey: 'flow-onboarding-v2', flowToken: t }, 99);
    expect(m.flowToken).toBe(t);
    const outro = montarSimulacao({ ...base, flowKey: 'flow-onboarding-v2b', flowToken: t }, 99);
    expect(outro.flowToken).toBe('ONBOARDING_B_99_5531997244887');
  });

  it.each([
    [{ flowKey: 'flow-b2b-agenda-v1' }, 'flowKey'],
    [{ phone: '31997244887' }, 'phone'],
    [{ modo: 'gravar' }, 'modo'],
    [{ simId: '../x' }, 'simId'],
    [{ pedido: { action: 'complete' } }, 'pedido.action'],
    [{ pedido: { action: 'data_exchange' } }, 'pedido.screen'],
    [{ pedido: { action: 'data_exchange', screen: 'HOME', data: [] } }, 'pedido.data'],
  ])('recusa %j no campo %s', (troca, campo) => {
    const m = montarSimulacao({ ...base, ...troca });
    expect(m.ok).toBe(false);
    expect(m.campo).toBe(campo);
  });
});

describe('controller simular', () => {
  const resposta = () => {
    const res = { statusCode: 200, corpo: null };
    res.status = (c) => ((res.statusCode = c), res);
    res.json = (j) => ((res.corpo = j), res);
    return res;
  };

  beforeEach(() => {
    process.env.SUPABASE_URL = 'https://proj.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'srk';
  });

  it('manda pra EF com service_role e o header do modo, e devolve a tela com o token', async () => {
    const fetchFalso = vi.fn(
      async () =>
        new Response(JSON.stringify({ ok: true, tela: { screen: 'HOME' }, bloqueios: [] })),
    );
    vi.stubGlobal('fetch', fetchFalso);
    const res = resposta();
    await simular({ body: { ...base, modo: 'teste' }, user: { email: 'a@b' } }, res);
    const [url, init] = fetchFalso.mock.calls[0];
    expect(url).toBe('https://proj.supabase.co/functions/v1/marketplace-service');
    expect(init.headers.Authorization).toBe('Bearer srk');
    expect(init.headers['x-estudio-simulacao']).toBe('teste');
    expect(JSON.parse(init.body).pedido.action).toBe('INIT');
    expect(res.statusCode).toBe(200);
    expect(res.corpo.data.tela).toEqual({ screen: 'HOME' });
    expect(res.corpo.data.flowToken).toMatch(/^MARKETPLACE_\d+_5531997244887$/);
    vi.unstubAllGlobals();
  });

  it('pedido torto nem chega na EF', async () => {
    const fetchFalso = vi.fn();
    vi.stubGlobal('fetch', fetchFalso);
    const res = resposta();
    await simular({ body: { ...base, modo: 'gravar' }, user: {} }, res);
    expect(res.statusCode).toBe(400);
    expect(fetchFalso).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});
