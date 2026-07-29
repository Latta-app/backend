// 03 (agendamento-ciclo-de-vida) — o header interno que o painel nunca mandava.
//
// A EF `merchant-scheduling-agent` recusa com 401 TODA operation mutante quando
// SCHEDULING_INTERNAL_SECRET existe do lado dela (index.ts:98-113). Este service
// mandava só Authorization + Content-Type, então as três ações do painel
// (cancelar / não compareceu / remarcar) tomavam 401: o estado não mudava, o tutor
// não era avisado, e o agendamento seguia CONFIRMED até o sweep escrever COMPLETED
// 24h depois. Medido em prod 29/07 com um probe de session_id zerado.
//
// O header é CONDICIONAL de propósito (mesmo rollout escalonado da chat-engine):
// com a env ausente o comportamento é idêntico ao de hoje, e quando ela chegar as
// três ações passam a funcionar sem novo deploy. Estes testes prendem as duas metades.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const EF_OK = { success: true, next_state: 'CANCELLED_BY_MERCHANT' };

const loadService = async () => {
  vi.resetModules();
  return import('../services/merchant-scheduling-agent.service.js');
};

const headersOfLastCall = () => globalThis.fetch.mock.calls.at(-1)[1].headers;

describe('merchant-scheduling-agent.service — header interno', () => {
  const envAntes = { ...process.env };

  beforeEach(() => {
    process.env.SUPABASE_URL = 'https://projeto.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-fake';
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => EF_OK,
    }));
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    process.env = { ...envAntes };
    vi.restoreAllMocks();
  });

  it('COM a env, manda x-latta-internal-secret nas três operations', async () => {
    process.env.SCHEDULING_INTERNAL_SECRET = 'segredo-de-teste';
    const svc = await loadService();

    for (const chamada of [
      () => svc.cancelByMerchant({ sessionId: 's1', reason: 'r' }),
      () => svc.noShowByMerchant({ sessionId: 's1', reason: 'r' }),
      () => svc.rescheduleByMerchant({ sessionId: 's1', newScheduledDate: '2026-08-01T10:00:00-03:00' }),
    ]) {
      await chamada();
      expect(headersOfLastCall()['x-latta-internal-secret']).toBe('segredo-de-teste');
    }
    expect(globalThis.fetch).toHaveBeenCalledTimes(3);
  });

  it('SEM a env, omite o header (não manda string vazia, que daria 401 igual)', async () => {
    delete process.env.SCHEDULING_INTERNAL_SECRET;
    const svc = await loadService();

    await svc.cancelByMerchant({ sessionId: 's1', reason: 'r' });

    expect('x-latta-internal-secret' in headersOfLastCall()).toBe(false);
    // e o Authorization continua indo — a ausência do secret não pode derrubar o resto
    expect(headersOfLastCall().Authorization).toBe('Bearer service-role-fake');
  });

  it('SEM a env, avisa no load — o conserto não pode ficar inativo em silêncio', async () => {
    delete process.env.SCHEDULING_INTERNAL_SECRET;
    await loadService();

    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining('SCHEDULING_INTERNAL_SECRET ausente'),
    );
  });

  it('no 401, o log distingue "não enviado" de "enviado e recusado"', async () => {
    globalThis.fetch = vi.fn(async () => ({
      ok: false,
      status: 401,
      json: async () => ({ success: false, error: 'unauthorized' }),
    }));

    delete process.env.SCHEDULING_INTERNAL_SECRET;
    const semEnv = await loadService();
    await expect(semEnv.cancelByMerchant({ sessionId: 's1' })).rejects.toThrow('unauthorized');
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('NÃO enviado'));

    vi.clearAllMocks();

    process.env.SCHEDULING_INTERNAL_SECRET = 'valor-divergente';
    const comEnv = await loadService();
    await expect(comEnv.cancelByMerchant({ sessionId: 's1' })).rejects.toThrow('unauthorized');
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('recusado'));
  });

  it('sem SUPABASE_URL continua abortando antes do fetch (guard intocado)', async () => {
    delete process.env.SUPABASE_URL;
    const svc = await loadService();

    await expect(svc.cancelByMerchant({ sessionId: 's1' })).rejects.toThrow('env vars ausentes');
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});
