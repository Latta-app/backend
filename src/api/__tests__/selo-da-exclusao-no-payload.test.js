// O selo da saída do titular chegando no payload da mensageria — a metade que
// faltava da S-03 (fatia S-21 da aposentadoria da v1).
//
// ── O ALCANCE ──────────────────────────────────────────────────────────────
// PEGA:
//   · o model do Contact perdendo `deletion_requested_at`. Este é o modo de
//     falha real, e ele é SILENCIOSO: nenhum builder da mensageria passa
//     `attributes` no Contact, todos herdam a lista do model, e o Sequelize
//     monta o SELECT coluna a coluna. Sem a declaração, a coluna existe em
//     prod, o purge a carimba, e nenhuma tela do painel a enxerga — que é
//     exatamente o estado que esta fatia foi aberta pra consertar;
//   · a coluna sendo declarada com o nome errado (camelCase, `deletionAt`) ou
//     com `field:` apontando pra outra coluna;
//   · o selo confundido com `deleted_at` — os dois têm que sobreviver lado a
//     lado no model. `deleted_at` é o degrau DESATIVAR, reversível e zerado
//     pelo primeiro inbound do tutor; o selo é irreversível por decisão.
// NÃO PEGA:
//   · se a coluna existe no banco. Isso foi medido à mão contra prod em
//     04/09/2026 pela Management API (`information_schema.columns`): a
//     migration `20260903150000` está aplicada nas duas raízes;
//   · se o chip e a linha do header renderizam — é do frontend, que não tem
//     runner de teste nesta casa (`ContactItem.jsx`, `ContactHeader.jsx`).
import { describe, it, expect } from 'vitest';
import { DataTypes } from 'sequelize';

import Contact from '../models/Communication/ContactModel.js';

/**
 * Sequelize de mentira: só registra o que o model DECLARA.
 *
 * O model é uma factory que recebe o sequelize, então dá pra lê-lo sem
 * `DATABASE_URL` e sem Postgres — mesma régua hermética da suíte da tag do A/B.
 */
const capturarAtributos = () => {
  const capturado = {};
  const sequelize = {
    define: (nome, atributos, opcoes) => {
      capturado.nome = nome;
      capturado.atributos = atributos;
      capturado.opcoes = opcoes;
      return { associate: null };
    },
  };
  Contact(sequelize);
  return capturado;
};

describe('o selo da exclusão no model do Contact', () => {
  it('declara `deletion_requested_at` — sem isso o Sequelize não seleciona a coluna', () => {
    const { atributos } = capturarAtributos();

    expect(Object.keys(atributos)).toContain('deletion_requested_at');
  });

  it('o selo é DATE e aceita nulo — nulo é o titular que nunca pediu nada', () => {
    const { atributos } = capturarAtributos();
    const selo = atributos.deletion_requested_at;

    expect(selo.type).toBe(DataTypes.DATE);
    expect(selo.allowNull).toBe(true);
  });

  it('o selo NÃO substitui `deleted_at` — os dois convivem, e são degraus diferentes', () => {
    const { atributos } = capturarAtributos();

    expect(Object.keys(atributos)).toContain('deleted_at');
    expect(Object.keys(atributos)).toContain('deletion_requested_at');
  });

  it('não renomeia a coluna por `field:` — a mensageria lê o nome do banco', () => {
    const { atributos, opcoes } = capturarAtributos();

    // `underscored: true` já é o contrato desta tabela; um `field:` aqui seria
    // um apelido que só o backend conhece, e o frontend lê a chave crua do
    // payload de detalhe (`{...contact, ...fetched}` em Messaging.jsx).
    expect(opcoes.underscored).toBe(true);
    expect(atributos.deletion_requested_at.field).toBeUndefined();
  });
});
