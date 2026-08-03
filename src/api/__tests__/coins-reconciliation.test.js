// A reconciliação do painel de lattinhas: o saldo materializado bate com a soma
// do ledger?
//
// Ref: docs/issues/painel-lattinhas/issues/02-* (repo Latta).
//
// Por que ISTO é o que tem teste, e não o SQL: o `latta_coins_balance` é um
// snapshot de uma soma que vive noutro lugar, e snapshot que sobrevive ao dado
// que descreve é mentira com data. A conta que compara os dois é a razão de
// existir do painel — e é pura, então dá pra travá-la sem banco.
//
// O caso do `saldo sem ledger` não é hipotético: foi medido em prod (03/08), um
// tutor com 10 lattinhas de saldo e ZERO lançamentos.

import { describe, it, expect } from 'vitest';
import CoinsService, { reconcile, normalizePaging } from '../services/coins.service.js';

describe('reconcile — saldo × ledger', () => {
  it('bate: delta 0 e matches true', () => {
    const r = reconcile({ total_coins: 60 }, 60);
    expect(r).toEqual({
      ledger_available_sum: 60,
      balance_total: 60,
      delta: 0,
      matches: true,
    });
  });

  it('🚨 saldo sem ledger (caso real de prod): delta positivo, matches false', () => {
    const r = reconcile({ total_coins: 10 }, 0);
    expect(r.delta).toBe(10);
    expect(r.matches).toBe(false);
  });

  it('ledger maior que o saldo: delta NEGATIVO — o tutor está sendo lesado', () => {
    const r = reconcile({ total_coins: 20 }, 50);
    expect(r.delta).toBe(-30);
    expect(r.matches).toBe(false);
  });

  it('tutor sem linha de saldo conta como ZERO, não some do relatório', () => {
    // Se `null` virasse "não dá pra comparar", quem tem lançamento e nenhum
    // saldo — a forma mais grave de divergência — sairia silenciosamente do
    // radar do painel.
    const r = reconcile(null, 30);
    expect(r.balance_total).toBe(0);
    expect(r.delta).toBe(-30);
    expect(r.matches).toBe(false);
  });

  it('tudo zerado bate (tutor novo não acende alarme)', () => {
    expect(reconcile(null, 0).matches).toBe(true);
  });

  it('saldo zerado com ledger só de cancelados bate', () => {
    // `cancelled` não entra na soma (o repository filtra por status), então o
    // tutor que teve tudo estornado não aparece como divergente.
    expect(reconcile({ total_coins: 0 }, 0).matches).toBe(true);
  });
});

describe('normalizePaging — o cliente não escolhe o custo da query', () => {
  it('default é 50/0', () => {
    expect(normalizePaging()).toEqual({ limit: 50, offset: 0 });
    expect(normalizePaging({})).toEqual({ limit: 50, offset: 0 });
  });

  it('teto de 200: limit gigante não vira varredura', () => {
    expect(normalizePaging({ limit: '99999' }).limit).toBe(200);
  });

  it('lixo e negativo caem no default, sem quebrar a query', () => {
    for (const bad of ['abc', '-5', '0', null, undefined, '']) {
      expect(normalizePaging({ limit: bad, offset: bad })).toEqual({ limit: 50, offset: 0 });
    }
  });

  it('valores válidos passam', () => {
    expect(normalizePaging({ limit: '10', offset: '20' })).toEqual({ limit: 10, offset: 20 });
  });
});

describe('a fachada exporta o que o controller usa', () => {
  it('getByPetOwner existe', () => {
    expect(typeof CoinsService.getByPetOwner).toBe('function');
  });
});
