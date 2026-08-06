// A conta do cashback aberta na tela: de que base saiu, a que taxa, e se o
// pedido podia pontuar.
//
// Ref: pedido do operador em 04/08 — "ao clicar no card do acúmulo por compra,
// exibir os detalhes do pedido" + "garantir que só pontue 1%/2% de pedido feito
// na Latta".
//
// 🚨 O caso que dá sentido ao arquivo é o `crédito antigo na tarifa antiga`. A
// taxa mudou em 03/08 (2%/4% → 1%/2%). Se esta função julgasse contra a tarifa
// de HOJE, todo crédito de julho apareceria como errado no painel — e o
// operador iria caçar um bug que não existe. Ela DERIVA a taxa em vez de julgar.

import { describe, it, expect } from 'vitest';
import { explainPurchase } from '../services/coins.service.js';

const linha = (over = {}) => ({
  action_key: 'purchase',
  coins_earned: 175,
  order_ref: {
    order_number: '496400271',
    source: 'latta',
    subtotal: '194.92',
    discount: '19.50',
    shipping_cost: '5.90',
    service_fee: '5.90',
    total: '187.22',
    ...over.order_ref,
  },
  ...over,
});

describe('explainPurchase — a base e a taxa', () => {
  it('base é subtotal menos desconto: frete e taxa de serviço ficam de fora', () => {
    // Pedido real (496400271): 194,92 − 19,50 = 175,42. O total pago é 187,22,
    // porque leva frete e taxa — e NÃO é a base (decisão do operador, 04/08).
    const r = explainPurchase(linha());
    expect(r.base).toBe(175.42);
    expect(r.subtotal).toBe(194.92);
    expect(r.discount).toBe(19.5);
  });

  it('deriva 1 lattinha por real = a tarifa de 1% de hoje', () => {
    const r = explainPurchase(linha());
    expect(r.coins_per_real).toBe(1);
    expect(r.rate_pct).toBe(1);
  });

  it('crédito ANTIGO na tarifa antiga não é marcado como errado — deriva 4%', () => {
    // A Valeria, Pro, em 25/07: 902 lattinhas sobre base de 225,50. Era 4% e
    // estava certo. Depois da virada pra 1%/2%, continua certo.
    const r = explainPurchase(linha({
      coins_earned: 902,
      order_ref: { subtotal: '253.49', discount: '27.99', source: 'latta' },
    }));
    expect(r.base).toBe(225.5);
    expect(r.coins_per_real).toBe(4);
  });

  it('Pro de hoje deriva 2 por real', () => {
    const r = explainPurchase(linha({
      coins_earned: 200,
      order_ref: { subtotal: '100.00', discount: '0', source: 'latta' },
    }));
    expect(r.coins_per_real).toBe(2);
  });
});

describe('explainPurchase — origem do pedido', () => {
  it.each(['latta', 'reorder', 'reminder'])('%s é compra nossa', (source) => {
    expect(explainPurchase(linha({ order_ref: { source } })).from_latta).toBe(true);
  });

  it('petz_sync NÃO é compra nossa — é o que a trava do banco recusa', () => {
    // Se isto aparecer `false` numa linha real do painel, o crédito não deveria
    // existir. São os 2 casos de maio (473012473 e 475236562) que motivaram a
    // trava `order_not_from_latta`.
    const r = explainPurchase(linha({ order_ref: { source: 'petz_sync' } }));
    expect(r.from_latta).toBe(false);
    expect(r.source).toBe('petz_sync');
  });

  it('source desconhecido não vira compra nossa por omissão', () => {
    expect(explainPurchase(linha({ order_ref: { source: 'marketplace_x' } })).from_latta).toBe(false);
    expect(explainPurchase(linha({ order_ref: { source: null } })).from_latta).toBe(false);
  });
});

describe('explainPurchase — ausências', () => {
  it('linha sem pedido devolve null, não uma conta vazia', () => {
    // Crédito de tutor purgado (3 medidos em 04/08): o pedido foi junto. A tela
    // ramifica por "tem ou não tem" — um objeto com zeros desenharia uma conta
    // que ninguém pode conferir.
    expect(explainPurchase({ action_key: 'purchase', coins_earned: 224 })).toBeNull();
    expect(explainPurchase(null)).toBeNull();
  });

  it('base zero devolve taxa null, nunca zero', () => {
    // `0` leria como "taxa zero", que é uma AFIRMAÇÃO. A verdade é "não sei".
    const r = explainPurchase(linha({
      coins_earned: 0,
      order_ref: { subtotal: '0', discount: '0' },
    }));
    expect(r.coins_per_real).toBeNull();
    expect(r.rate_pct).toBeNull();
  });

  it('desconto maior que o subtotal não produz taxa negativa', () => {
    const r = explainPurchase(linha({
      coins_earned: 0,
      order_ref: { subtotal: '10.00', discount: '15.00' },
    }));
    expect(r.base).toBe(-5);
    expect(r.coins_per_real).toBeNull();
  });
});
