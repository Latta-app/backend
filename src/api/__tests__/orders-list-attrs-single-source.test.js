// GUARD ESTRUTURAL — a lista de colunas do pedido é UMA só.
//
// A mensageria monta a lista de Pedidos em dois passos: a página 1 vem embutida
// no payload do contato, e as seguintes chegam por `getOrdersByContactId` no
// scroll. Os dois liam listas de `attributes` SEPARADAS, escritas à mão e
// idênticas por coincidência.
//
// 🚨 O sintoma dessa duplicação não é erro — é a lista MUDANDO DE FORMA no meio
// do scroll: os 10 primeiros pedidos com o campo novo, o 11º sem. Nada quebra,
// nada acende, e o operador vê um pedido "sem número" que só está sem número
// porque rolou a tela.
//
// É o mesmo pedágio que o comentário do `chat_history` neste arquivo registra
// ("eram SEIS copias identicas... esquecer um deles faz a tela mentir em
// silencio"). A regra já estava escrita em prosa; este teste é o que impede a
// segunda cópia de voltar.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const SRC = readFileSync(
  fileURLToPath(new URL('../repositories/chat-history.repository.js', import.meta.url)),
  'utf8',
);

describe('lista de colunas do pedido — fonte única', () => {
  it('só existe UMA definição literal de ORDER_LIST_ATTRS', () => {
    const definicoes = SRC.match(/const\s+ORDER_LIST_ATTRS\s*=/g) || [];
    expect(definicoes).toHaveLength(1);
  });

  it('nenhum `attributes` de Order lista as colunas à mão', () => {
    // A forma exata da cópia que existia: um array literal de attributes com
    // 'marketplace_order_id' dentro. Se voltar, o guard acusa.
    const copias = SRC.match(/attributes:\s*\[[^\]]*marketplace_order_id[^\]]*\]/g) || [];
    expect(
      copias,
      'Alguém voltou a escrever as colunas do pedido à mão em vez de usar ORDER_LIST_ATTRS. ' +
        'A página 1 e a paginação PRECISAM ler a mesma lista, senão a tela muda de forma no scroll.',
    ).toEqual([]);
  });

  it('a lista carrega o NUMBER além do ID — são colunas diferentes', () => {
    // `marketplace_order_id` (1354253258) e `marketplace_order_number`
    // (493363734) são números diferentes do mesmo pedido. O ledger de lattinhas
    // referencia o NUMBER; sem ele no payload, não dá pra cruzar o extrato com
    // a lista de Pedidos.
    const bloco = SRC.match(/const\s+ORDER_LIST_ATTRS\s*=\s*\[([\s\S]*?)\]/)?.[1] ?? '';
    expect(bloco).toContain("'marketplace_order_id'");
    expect(bloco).toContain("'marketplace_order_number'");
  });
});
