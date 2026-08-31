// A FALA DA PROPOSTA: o agente conta a campanha em português de gente.
//
// ── O ALCANCE ──────────────────────────────────────────────────────────────
// PEGA:
//   · 🚨 NOME DE CAMPO vazando pra tela. É o defeito que esta rodada existe pra
//     consertar: a proposta chegava escrita em `fotoEscopo = algum`, que é o
//     formulário de novo, e é ilegível pra quem não leu o código. O guard varre
//     as frases atrás dos nomes reais do vocabulário e do sinal de igual;
//   · 🚨 VALOR SEM FRASE. A lista de valores é derivada do VOCABULARIO, então um
//     valor novo cadastrado lá sem tradução aqui reprova. É a resposta ao
//     guard-álibi: lista escrita à mão defasa na primeira mudança e passa a
//     aprovar o que não olhou;
//   · o guia de linguagem: travessão, emoji e futuro do presente nas frases;
//   · decisão saindo sem destino de conserto (a aba pra onde a linha leva).
// NÃO PEGA:
//   · o `porque`, que é escrito pelo MODELO em tempo de conversa. Nenhum teste
//     offline alcança aquilo: a prova dele é a conversa real, rodada à mão.
import { describe, it, expect, vi } from 'vitest';

vi.mock('../../config/database.js', () => ({ sequelize: { query: vi.fn(async () => []) } }));
vi.mock('../../config/postgres.js', () => ({ pgQuery: vi.fn(async () => ({ rows: [] })) }));

import {
  fraseDoCampo,
  fraseDoVinculo,
  abaDoCampo,
  COMO,
} from '../services/campaign-fala.service.js';
import { VOCABULARIO } from '../services/campaign-briefing.service.js';
import { GRUPOS_DE_VINCULO } from '../services/campaign-audience.service.js';

const TIPOS = [
  { nome: 'primary', rotulo: 'Principal Responsável' },
  { nome: 'co_parent', rotulo: 'Co-tutor' },
  { nome: 'veterinarian', rotulo: 'Veterinário' },
  { nome: 'support_network', rotulo: 'Rede de Apoio' },
];
const ROTULOS = Object.fromEntries(TIPOS.map((t) => [t.nome, t.rotulo]));

/** Todo par campo+valor que o vocabulário aceita, derivado dele. */
const TODOS_OS_PARES = Object.entries(VOCABULARIO).flatMap(([campo, spec]) => {
  const valores = typeof spec.valores === 'function' ? spec.valores(TIPOS) : spec.valores;
  return valores.map((valor) => ({ campo, valor }));
});

describe('🚨 nenhum nome de campo chega na tela', () => {
  it('toda frase do vocabulário está em português, sem nome de campo', () => {
    // Os nomes que NÃO podem aparecer são os do próprio vocabulário, mais os
    // das colunas que a gente sabe que já vazaram em comentário e em prosa.
    const proibidos = [
      ...Object.keys(VOCABULARIO),
      'escopo',
      'descricaoFotos',
      'textoDaArte',
      'original_photo',
      'deceased_on',
      'is_main_owner',
      'pet_owner_pets',
      'pet_owner_types',
      'pet_breeds',
      'nudge_suppressions',
    ];

    for (const { campo, valor } of TODOS_OS_PARES) {
      const frase = fraseDoCampo(campo, valor, { rotulosDeVinculo: ROTULOS });
      expect(frase, `${campo}=${valor} não tem frase`).toBeTruthy();
      for (const nome of proibidos) {
        expect(frase.toLowerCase(), `"${frase}" cita o campo ${nome}`).not.toContain(
          nome.toLowerCase(),
        );
      }
      // 🚨 E nada de `campo = valor` sobrevivendo em forma de texto.
      expect(frase, `"${frase}" tem cara de formulário`).not.toMatch(/=/);
    }
  });

  it('🚨 valor sem tradução devolve null, e NUNCA um "campo = valor" de fallback', () => {
    // O fallback é a tentação inteira: ele não quebra teste nenhum, parece que
    // funciona, e devolve a coluna crua pro operador. Devolver null obriga quem
    // chama a tratar, e faz o guard acima reprovar o vocabulário incompleto.
    expect(fraseDoCampo('especie', 'Reptile')).toBeNull();
    expect(fraseDoCampo('campoQueNaoExiste', true)).toBeNull();
  });

  it('os três campos livres da produção têm frase inclusive quando estão vazios', () => {
    // Campo livre em branco é a lacuna mais fácil de passar batido: sem frase
    // ele simplesmente não aparece, e "ninguém escreveu a frase da arte" some.
    expect(fraseDoCampo('descricaoFotos', '')).toMatch(/sem instrução/i);
    expect(fraseDoCampo('textoDaArte', '')).toMatch(/ninguém disse/i);
    expect(fraseDoCampo('descricaoFotos', 'o pet no centro')).toContain('o pet no centro');
  });
});

describe('🚨 o vínculo fala pelos sete tipos, não por três', () => {
  it('cada grupo tem frase própria', () => {
    for (const grupo of Object.keys(GRUPOS_DE_VINCULO)) {
      expect(fraseDoVinculo(grupo, ROTULOS), `grupo ${grupo} sem frase`).toBeTruthy();
    }
  });

  it('🚨 o tipo que não é grupo vira frase a partir do RÓTULO do banco', () => {
    // Escrever os sete à mão aqui seria a mesma lista que defasa: o oitavo tipo
    // cadastrado amanhã sairia da tela sem nada acusar.
    expect(fraseDoVinculo('veterinarian', ROTULOS)).toBe('Só quem entra como veterinário');
    expect(fraseDoVinculo('support_network', ROTULOS)).toBe('Só quem entra como rede de apoio');
  });

  it('tipo desconhecido não inventa frase', () => {
    expect(fraseDoVinculo('groomer', ROTULOS)).toBeNull();
  });

  it('🚨 "dono" é o grupo que resolve o veterinário, e é principal mais co-tutor', () => {
    // O Dia do Cachorro tirou um veterinário do público com exclusão manual,
    // sob a justificativa de que nada no schema separava veterinário de tutor.
    // Separa. Esta é a regra que a exclusão à mão estava imitando.
    expect(GRUPOS_DE_VINCULO.dono).toEqual(['primary', 'co_parent']);
    expect(GRUPOS_DE_VINCULO.dono).not.toContain('veterinarian');
  });
});

describe('🚨 toda decisão sabe pra onde levar', () => {
  it('todo campo do vocabulário aponta uma aba', () => {
    for (const campo of Object.keys(VOCABULARIO)) {
      expect(abaDoCampo(campo), `${campo} não leva a lugar nenhum`).toBeTruthy();
    }
    for (const campo of ['escopo', 'descricaoFotos', 'textoDaArte']) {
      expect(abaDoCampo(campo)).toBe('producao');
    }
  });

  it('campo que não existe não inventa destino', () => {
    expect(abaDoCampo('inventado')).toBeNull();
  });
});

describe('🚨 as frases seguem o guia de linguagem', () => {
  const frases = [
    ...TODOS_OS_PARES.map((p) => fraseDoCampo(p.campo, p.valor, { rotulosDeVinculo: ROTULOS })),
    fraseDoCampo('escopo', 'tutor'),
    fraseDoCampo('escopo', 'pet'),
    fraseDoCampo('descricaoFotos', ''),
    fraseDoCampo('textoDaArte', ''),
    ...Object.values(COMO),
  ].filter(Boolean);

  it('zero travessão', () => {
    // Regra dura do guia, e o tell mais óbvio de texto gerado por máquina.
    for (const f of frases) expect(f, `"${f}" tem travessão`).not.toContain('—');
  });

  it('zero emoji', () => {
    for (const f of frases) expect(f, `"${f}" tem emoji`).not.toMatch(/\p{Extended_Pictographic}/u);
  });

  it('presente do indicativo: nada de "vai", "será" nem "em breve"', () => {
    for (const f of frases) {
      expect(f, `"${f}" fala no futuro`).not.toMatch(/\b(vai|irá|será|serão|em breve)\b/i);
    }
  });

  it('sentence case: a frase não começa em minúscula nem grita', () => {
    for (const f of frases) {
      if (f === f.toLowerCase()) continue; // os rótulos de COMO são minúsculos de propósito
      expect(f[0], `"${f}" começa minúscula`).toBe(f[0].toUpperCase());
      expect(f, `"${f}" está em caixa alta`).not.toBe(f.toUpperCase());
    }
  });
});
