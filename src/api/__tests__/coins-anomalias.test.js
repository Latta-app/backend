// O destaque de anomalia do painel de lattinhas (fatia 04).
//
// Ref: docs/issues/painel-lattinhas/issues/04-* (repo Latta).
//
// 🚨 O que estes testes protegem NÃO é "detectar anomalia" — é **não tocar à
// toa**. As duas regras da issue foram escritas antes de medir e as duas
// estavam erradas contra prod:
//
//   1. duplicado por (action_key, reference_id) acusava 16 linhas de
//      `admin_grant` que eram 16 TUTORES com o mesmo reference_id de campanha
//      (`entry_floor_60_2026_07_22`). `reference_id` às vezes é rótulo de lote.
//   2. pendente vencido por `available_at < NOW()` acusava um cashback que
//      amadureceu às 18h43 — estado perfeitamente normal, porque o cron de
//      liberação roda 1×/dia às 03h.
//
// Com as regras corrigidas: zero e zero, em 485 lançamentos. Um painel que
// acendesse nesses dois casos gritaria todo dia, e aí o dia do alarme de verdade
// ninguém olharia.

import { describe, it, expect } from 'vitest';
import { buildAnomalies, reconcile } from '../services/coins.service.js';

const OK = reconcile({ total_coins: 60 }, 60);
const DIVERGE = reconcile({ total_coins: 10 }, 0);

describe('buildAnomalies — silêncio é o estado normal', () => {
  it('tutor saudável não acende NADA (nem um "tudo certo" verde)', () => {
    const a = buildAnomalies(OK, [], []);
    expect(a.has_any).toBe(false);
    expect(a.balance_mismatch).toBeNull();
    expect(a.duplicates).toEqual([]);
    expect(a.stale_pending).toEqual([]);
  });

  it('listas ausentes (undefined) não quebram nem viram falso positivo', () => {
    const a = buildAnomalies(OK, undefined, undefined);
    expect(a.has_any).toBe(false);
  });
});

describe('buildAnomalies — o que DEVE acender', () => {
  it('🚨 saldo divergente (o caso real de prod: 10 lattinhas sem origem)', () => {
    const a = buildAnomalies(DIVERGE, [], []);
    expect(a.has_any).toBe(true);
    expect(a.balance_mismatch).toEqual({ delta: 10 });
  });

  it('duplicado acende mesmo com o saldo batendo', () => {
    // Um retry que creditou 2× DEIXA o saldo consistente com o ledger: os dois
    // lançamentos estão lá. Só a repetição denuncia — por isso ela é uma regra
    // separada, e não um derivado da reconciliação.
    const a = buildAnomalies(OK, [{ action_key: 'purchase', count: 2 }], []);
    expect(a.has_any).toBe(true);
    expect(a.duplicates).toHaveLength(1);
    expect(a.balance_mismatch).toBeNull();
  });

  it('pendente vencido acende sozinho', () => {
    const a = buildAnomalies(OK, [], [{ id: 'x', coins_earned: 213 }]);
    expect(a.has_any).toBe(true);
    expect(a.stale_pending).toHaveLength(1);
  });

  it('as três juntas convivem — nenhuma engole a outra', () => {
    const a = buildAnomalies(DIVERGE, [{ count: 2 }], [{ id: 'x' }]);
    expect(a.has_any).toBe(true);
    expect(a.balance_mismatch).toEqual({ delta: 10 });
    expect(a.duplicates).toHaveLength(1);
    expect(a.stale_pending).toHaveLength(1);
  });

  it('delta negativo também acende (o tutor está sendo lesado)', () => {
    const a = buildAnomalies(reconcile({ total_coins: 20 }, 50), [], []);
    expect(a.balance_mismatch).toEqual({ delta: -30 });
    expect(a.has_any).toBe(true);
  });
});
