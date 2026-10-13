// O funil do onboarding v2 e a lista de pessoas (rodada
// virada-do-onboarding-pro-a, Lane 2, no monorepo Latta).
//
// ── O ALCANCE ──────────────────────────────────────────────────────────────
// PEGA:
//   · o braço não chegando na EF (sem ele a EF responde 400 e o card fica vazio);
//   · o funil v2 aceitando braço inválido ou ausente (a EF exige A|B);
//   · a lista de pessoas forçando braço: omitido é "todos", e é ele que traz o
//     histórico do chat_history (quem nunca teve evento);
//   · as rotas novas sem o mesmo guard de role das vizinhas.
// NÃO PEGA:
//   · o que a EF/RPC devolve (o fetch é mockado). A RPC foi provada contra
//     prod em rollback, com mutação, no PR do monorepo.
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

describe('onboarding_funnel_v2', () => {
  it('manda action, braço, janela e o modo dev pra EF', async () => {
    await DashboardService.getOnboardingFunnelV2({ window: '30d', braco: 'A', includeTest: true });
    const u = urlChamada();
    expect(u.pathname).toBe('/functions/v1/dashboard-metrics');
    expect(u.searchParams.get('action')).toBe('onboarding_funnel_v2');
    expect(u.searchParams.get('braco')).toBe('A');
    expect(u.searchParams.get('window')).toBe('30d');
    expect(u.searchParams.get('include_test')).toBe('true');
  });

  it('recusa braço ausente ou inválido, sem chamar a EF', async () => {
    await expect(DashboardService.getOnboardingFunnelV2({ window: '7d' })).rejects.toThrow(/braco/);
    await expect(DashboardService.getOnboardingFunnelV2({ braco: 'C' })).rejects.toThrow(/braco/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('onboarding_pessoas', () => {
  it('braço omitido = todos (não manda o parâmetro)', async () => {
    await DashboardService.getOnboardingPessoas({ window: '90d' });
    const u = urlChamada();
    expect(u.searchParams.get('action')).toBe('onboarding_pessoas');
    expect(u.searchParams.has('braco')).toBe(false);
  });

  it('braço B vai pra EF; braço inválido é recusado', async () => {
    await DashboardService.getOnboardingPessoas({ braco: 'B' });
    expect(urlChamada().searchParams.get('braco')).toBe('B');
    await expect(DashboardService.getOnboardingPessoas({ braco: 'x' })).rejects.toThrow(/braco/);
  });
});

describe('rotas', () => {
  it('as duas rotas novas existem com o mesmo guard das vizinhas', async () => {
    const { default: router } = await import('../routes/private/dashboard.routes.js');
    const rota = (path) => router.stack.find((l) => l.route?.path === path)?.route;
    for (const path of ['/onboarding-funnel-v2', '/onboarding-pessoas']) {
      const r = rota(path);
      expect(r, path).toBeTruthy();
      expect(r.methods.get).toBe(true);
      const vizinha = rota('/onboarding-funnel');
      expect(r.stack.length).toBe(vizinha.stack.length);
    }
  });
});
