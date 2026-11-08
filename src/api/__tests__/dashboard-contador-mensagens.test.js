// O contador de mensagens por tutor desde 08/11/2026 (ação de Black Friday).
//
// ── O ALCANCE ──────────────────────────────────────────────────────────────
// PEGA:
//   · o período não chegando na EF (sem ele a EF cai no acumulado da ação);
//   · período ou limite fora da lista passando direto pra EF;
//   · a rota nova sem o mesmo guard de role das vizinhas.
// NÃO PEGA:
//   · o que a EF/RPC devolve (o fetch é mockado). A RPC é a
//     get_contador_de_mensagens, no monorepo.
import { describe, it, expect, beforeEach, vi } from 'vitest';

// A rota importa o middleware de auth, que puxa o banco: hermético aqui.
vi.mock('../../config/database.js', () => ({ sequelize: { query: vi.fn(async () => []) } }));
vi.mock('jsonwebtoken', () => ({ default: { verify: vi.fn(), sign: vi.fn() } }));
vi.mock('../../config/postgres.js', () => ({ pgQuery: vi.fn(async () => []) }));

process.env.SUPABASE_URL = 'https://exemplo.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'chave-de-teste';

const { default: DashboardService } = await import('../services/dashboard.service.js');

const fetchMock = vi.fn();
globalThis.fetch = fetchMock;

const urlChamada = () => new URL(fetchMock.mock.calls[0][0]);

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockResolvedValue({ ok: true, json: async () => ({ data: {} }) });
});

describe('contador_mensagens', () => {
  it('manda action, período, limite e o modo dev pra EF', async () => {
    await DashboardService.getContadorDeMensagens({
      periodo: 'black_friday',
      limit: 500,
      includeTest: true,
    });
    const u = urlChamada();
    expect(u.pathname).toBe('/functions/v1/dashboard-metrics');
    expect(u.searchParams.get('action')).toBe('contador_mensagens');
    expect(u.searchParams.get('periodo')).toBe('black_friday');
    expect(u.searchParams.get('limit')).toBe('500');
    expect(u.searchParams.get('include_test')).toBe('true');
  });

  it('período omitido não manda o parâmetro (a EF assume o acumulado da ação)', async () => {
    await DashboardService.getContadorDeMensagens({});
    expect(urlChamada().searchParams.has('periodo')).toBe(false);
  });

  it('recusa período e limite fora da lista, sem chamar a EF', async () => {
    await expect(
      DashboardService.getContadorDeMensagens({ periodo: '2025-01-01' }),
    ).rejects.toThrow(/periodo/);
    await expect(DashboardService.getContadorDeMensagens({ limit: 5000 })).rejects.toThrow(
      /limit/,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('rotas', () => {
  it('a rota nova existe com o mesmo guard das vizinhas', async () => {
    const { default: router } = await import('../routes/private/dashboard.routes.js');
    const rota = (path) => router.stack.find((l) => l.route?.path === path)?.route;
    const r = rota('/contador-mensagens');
    expect(r).toBeTruthy();
    expect(r.methods.get).toBe(true);
    expect(r.stack.length).toBe(rota('/client-ranking').stack.length);
  });
});
