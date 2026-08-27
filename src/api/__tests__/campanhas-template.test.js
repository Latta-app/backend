// A concordância de gênero do template da campanha.
//
// ── O ALCANCE ──────────────────────────────────────────────────────────────
// PEGA:
//   · 🚨 gênero INFERIDO do nome do pet. É o defeito central: "Luna" pode ser
//     macho e "Mel" pode ser macho, e uma heurística de terminação acerta a
//     maioria e erra numa mensagem que chama o cachorro de alguém pelo pronome
//     errado — numa peça que a pessoa recebeu justamente porque é sobre o
//     animal dela;
//   · 🚨 pet sem gênero cadastrado virando masculino por omissão. Esse é o pior
//     caso possível: o texto sai plausível, a prévia não acusa, o envio dá 200,
//     e só o tutor vê. A casa tem que ficar BLOQUEADA;
//   · grupo misto caindo em feminino plural (o português leva masculino);
//   · variável que resolve vazia passando calada. "Oi , tudo bem?" é um
//     template válido e um envio bem-sucedido;
//   · forma de concordância que falta sendo preenchida com outra;
//   · plural derivado por regra ("cão" → "cãos").
// NÃO PEGA:
//   · se o template está APPROVED na Meta — isso é o catálogo;
//   · se o nome do tutor no banco está certo. Ver a régua de nome de gente.
import { describe, it, expect, vi } from 'vitest';

vi.mock('../../config/database.js', () => ({ sequelize: { query: vi.fn(async () => []) } }));

import {
  generoDaCasa,
  formaDaCasa,
  juntarNomes,
  primeiroNome,
  variaveisDoCorpo,
  preencherMarcacoes,
} from '../services/campaign-template.service.js';

const pet = (nome, genero) => ({ nome, genero });

describe('🚨 o gênero sai do cadastro, nunca do nome', () => {
  it('um macho é masculino singular', () => {
    expect(formaDaCasa(generoDaCasa([pet('Bilbo', 'Male')]))).toBe('m');
  });

  it('uma fêmea é feminino singular', () => {
    expect(formaDaCasa(generoDaCasa([pet('Ursa', 'Female')]))).toBe('f');
  });

  it('🚨 "Luna" cadastrada como MACHO é masculino, e o nome não tem voto', () => {
    expect(formaDaCasa(generoDaCasa([pet('Luna', 'Male')]))).toBe('m');
  });

  it('🚨 "Thor" cadastrado como FÊMEA é feminino, e o nome não tem voto', () => {
    expect(formaDaCasa(generoDaCasa([pet('Thor', 'Female')]))).toBe('f');
  });

  it('🚨 pet sem gênero BLOQUEIA a casa, e diz qual pet falta', () => {
    const g = generoDaCasa([pet('Mel', null)]);
    expect(g.falta).toEqual(['Mel']);
    // O que NÃO pode acontecer: virar masculino por omissão.
    expect(formaDaCasa(g)).toBe(null);
    expect(g.feminino).toBeUndefined();
  });

  it('numa casa mista, só o pet sem gênero é apontado', () => {
    expect(generoDaCasa([pet('Bilbo', 'Male'), pet('Mel', null)]).falta).toEqual(['Mel']);
  });

  it('casa sem pet nenhum bloqueia em vez de resolver pra alguma coisa', () => {
    expect(generoDaCasa([]).falta).toHaveLength(1);
  });
});

describe('o plural segue o português, não a contagem crua', () => {
  it('duas fêmeas levam feminino plural', () => {
    expect(formaDaCasa(generoDaCasa([pet('Ursa', 'Female'), pet('Mel', 'Female')]))).toBe('fp');
  });

  it('🚨 grupo MISTO leva masculino plural', () => {
    expect(formaDaCasa(generoDaCasa([pet('Ursa', 'Female'), pet('Bilbo', 'Male')]))).toBe('mp');
  });

  it('três machos levam masculino plural', () => {
    expect(
      formaDaCasa(generoDaCasa([pet('Noé', 'Male'), pet('Caçula', 'Male'), pet('Manu', 'Male')])),
    ).toBe('mp');
  });
});

describe('os nomes saem como gente escreve', () => {
  it('um nome sai sozinho', () => {
    expect(juntarNomes(['Bilbo'])).toBe('Bilbo');
  });

  it('dois nomes levam "e"', () => {
    expect(juntarNomes(['Bilbo', 'Vamp'])).toBe('Bilbo e Vamp');
  });

  it('três nomes levam vírgula e "e" no fim, não vírgula em tudo', () => {
    expect(juntarNomes(['Noé', 'Caçula', 'Manu'])).toBe('Noé, Caçula e Manu');
  });

  it('nome vazio no meio não vira vírgula solta', () => {
    expect(juntarNomes(['Bilbo', '', 'Vamp'])).toBe('Bilbo e Vamp');
  });
});

describe('o primeiro nome do tutor', () => {
  it('corta no espaço', () => {
    expect(primeiroNome('Lucas Andrade Silva')).toBe('Lucas');
  });

  it('🚨 nome de negócio não é mutilado, só cortado no espaço', () => {
    // A régua de nome de gente não roda aqui: o nome já vem limpo do banco, e
    // dígito dentro do token é decisão tomada em 27/08.
    expect(primeiroNome('Studio Cicarello 3D')).toBe('Studio');
  });

  it('nome vazio devolve vazio, não "undefined"', () => {
    expect(primeiroNome(null)).toBe('');
    expect(primeiroNome('   ')).toBe('');
  });
});

describe('🚨 a forma de gênero carrega os nomes dentro', () => {
  // O template `dia_do_cachorro_v2`, aprovado na Meta, pede num slot só:
  // "eu fiz uma homenagem {{1}}" -> "pro Bilbo" / "pra Ursa" / "pros Noé,
  // Caçula e Manu". Separar em duas variáveis exigiria mudar o template
  // aprovado, que ninguém faz no meio de uma campanha.
  const dados = { pets: 'Noé, Caçula e Manu', tutor: 'Lucas' };

  it('{pets} vira os nomes juntos', () => {
    expect(preencherMarcacoes('pros {pets}', dados)).toBe('pros Noé, Caçula e Manu');
  });

  it('{tutor} vira o primeiro nome', () => {
    expect(preencherMarcacoes('Oi {tutor}', dados)).toBe('Oi Lucas');
  });

  it('as duas juntas, e o resto do texto fica intacto', () => {
    expect(preencherMarcacoes('{tutor}, olha só o {pets}!', dados)).toBe(
      'Lucas, olha só o Noé, Caçula e Manu!',
    );
  });

  it('marcação que não existe fica como está, em vez de virar vazio', () => {
    // Vazio silencioso é o defeito: "olha o " sai plausível e ninguém acusa.
    expect(preencherMarcacoes('olha o {cachorro}', dados)).toBe('olha o {cachorro}');
  });
});

describe('as posições do corpo', () => {
  it('acha as variáveis e não repete', () => {
    expect(variaveisDoCorpo('Oi {{1}}, o {{2}} te espera. Até logo, {{1}}!')).toEqual(['1', '2']);
  });

  it('corpo sem variável devolve lista vazia', () => {
    expect(variaveisDoCorpo('Feliz dia do cachorro!')).toEqual([]);
  });
});
