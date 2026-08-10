// GUARD ESTRUTURAL — include com `where` é INNER JOIN, e INNER JOIN some com contato.
//
// No Sequelize, um `include` que tem `where` e NÃO tem `required: false` vira
// INNER JOIN. Pior: include obrigatório PROPAGA a obrigatoriedade pro pai — um
// `pets` em INNER dentro de `petOwner` faz o `petOwner` virar obrigatório
// também, mesmo sem `where` nenhum nele.
//
// 🚨 O sintoma não é erro: é o contato SUMIR. O builder da busca
// (`searchContacts`) era o único deste arquivo sem `required: false` no
// `pets`, e com isso a busca só enxergava quem já tinha pet ativo cadastrado.
// Medido em prod (10/08/2026): 75 dos 166 contatos — 45% — invisíveis pra
// busca, incluindo todo mundo que ainda não terminou o onboarding. A listagem
// paginada mostrava a conversa; digitar o nome dela devolvia "Nenhuma conversa
// encontrada".
//
// A regra já estava no arquivo em forma de comentário ("← ADICIONA ESTA
// LINHA!", no builder que foi consertado primeiro). Este teste é o que impede
// a próxima cópia de nascer sem ela.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const SRC = readFileSync(
  fileURLToPath(new URL('../repositories/chat-history.repository.js', import.meta.url)),
  'utf8',
);

// Recorta o bloco de cada include `as: '<alias>'` até o próximo `as:` do
// arquivo. Não é parser de JS — é o suficiente pra ver se `required: false`
// acompanha o `where` DAQUELE include, que é o que o bug exige.
const blocosDoInclude = (alias) => {
  const blocos = [];
  const marcador = `as: '${alias}'`;
  let from = 0;
  for (;;) {
    const inicio = SRC.indexOf(marcador, from);
    if (inicio === -1) break;
    const proximo = SRC.indexOf('as: ', inicio + marcador.length);
    blocos.push(SRC.slice(inicio, proximo === -1 ? SRC.length : proximo));
    from = inicio + marcador.length;
  }
  return blocos;
};

describe('includes de contato — LEFT JOIN obrigatório', () => {
  it.each(['pets', 'tags'])(
    'todo include de `%s` com `where` declara `required: false`',
    (alias) => {
      const blocos = blocosDoInclude(alias);
      expect(blocos.length).toBeGreaterThan(0);

      const semRequired = blocos.filter(
        (b) => b.includes('where:') && !b.includes('required: false'),
      );

      expect(
        semRequired,
        `Include de '${alias}' com 'where' e sem 'required: false' vira INNER JOIN e ESCONDE ` +
          'o contato inteiro da lista/busca (o include obrigatório propaga pro petOwner). ' +
          'Foi assim que 45% dos contatos ficaram invisíveis na busca.',
      ).toHaveLength(0);
    },
  );

  it('o `petOwner` que a busca RENDERIZA é explicitamente opcional', () => {
    const inicio = SRC.indexOf('const searchContacts = async');
    const busca = SRC.slice(inicio, SRC.indexOf('const getReplyMessageById', inicio));

    // O primeiro `as: 'petOwner'` da busca é a subconsulta que casa o nome do
    // tutor — essa é obrigatória de propósito (é o próprio filtro). A que
    // importa aqui é a do payload, a última.
    const petOwner = busca.slice(busca.lastIndexOf("as: 'petOwner'"));

    expect(
      petOwner.slice(0, petOwner.indexOf('attributes:')).includes('required: false'),
      'Contato sem pet_owner (quem ainda não terminou o cadastro) precisa aparecer na busca. ' +
        'Sem `required: false` explícito, qualquer include filho obrigatório derruba ele.',
    ).toBe(true);
  });
});
