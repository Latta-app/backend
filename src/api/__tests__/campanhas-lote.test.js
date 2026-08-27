// O lote da campanha: nome de arquivo, modo da peça, direção aprovada e retry.
//
// ── O ALCANCE ──────────────────────────────────────────────────────────────
// PEGA:
//   · 🚨 nome de arquivo fixo ou que não distingue destinatário. Em 26/08 uma
//     peça foi parar na casa errada exatamente assim: dois workers escreveram
//     no mesmo arquivo e o segundo sobrescreveu o primeiro. O tutor recebeu o
//     cachorro de outra pessoa, e nada no processo acusou;
//   · 🚨 3+ fotos indo soltas no request. Com 4 imagens o modelo perde a âncora
//     da cena e re-renderiza o lettering com grafia errada ("caschorho",
//     medido 2x). O guard trava o MODO e o texto do prompt que explica a tira;
//   · lote disparando sem direção aprovada, que é gerar 69 peças de uma direção
//     que ninguém olhou;
//   · 🚨 lote lendo os campos VIVOS do formulário em vez da receita congelada.
//     Sem isso a aprovação não aprova nada: basta editar uma palavra depois de
//     aprovar pra o lote sair diferente da amostra;
//   · retentativa imediata. As 5 falhas da primeira passada de 26/08 eram de
//     transporte, e retentar na hora esbarra na mesma condição que derrubou;
//   · peça que falha em todas as tentativas ficando sem o motivo registrado.
// NÃO PEGA:
//   · se o Postgres de fato recusa dois arquivos iguais — quem responde isso é
//     o índice único `(campaign_id, arquivo)`, provado direto contra prod em
//     27/08 num bloco que se desfez;
//   · se a peça saiu bonita. É o canvas de revisão, e é humano.
import { describe, it, expect, beforeEach, vi } from 'vitest';

const query = vi.fn(async () => []);
vi.mock('../../config/database.js', () => ({ sequelize: { query: (...a) => query(...a) } }));

const gerarPeca = vi.fn();
vi.mock('../services/campaign-piece.service.js', async (real) => {
  const modulo = await real();
  return { ...modulo, gerarPeca: (...a) => gerarPeca(...a) };
});

import { nomeDoArquivo, modoDaPeca, montarPrompt } from '../services/campaign-piece.service.js';
import {
  ESPERAS,
  produzirPeca,
  iniciarLote,
  lerDirecaoAprovada,
} from '../services/campaign-batch.service.js';

describe('o nome do arquivo sai do TELEFONE, e nunca é fixo', () => {
  it('deriva do telefone e carrega os dígitos dele', () => {
    expect(nomeDoArquivo({ telefone: '5531999300962' })).toBe('t5531999300962.jpg');
  });

  it('limpa a formatação sem perder o número', () => {
    expect(nomeDoArquivo({ telefone: '+55 (31) 99930-0962' })).toBe('t5531999300962.jpg');
  });

  it('🚨 duas casas nunca compartilham nome', () => {
    const casas = ['5531999300962', '5511996514942', '5531996155934', '551152950227'];
    const nomes = casas.map((telefone) => nomeDoArquivo({ telefone }));
    expect(new Set(nomes).size).toBe(casas.length);
  });

  it('🚨 na campanha por PET, as três peças da mesma casa não colidem entre si', () => {
    const telefone = '5531999300962';
    const nomes = ['aaaaaaaa-1111-4111-8111-111111111111', 'bbbbbbbb-2222-4222-8222-222222222222', 'cccccccc-3333-4333-8333-333333333333'].map(
      (petId) => nomeDoArquivo({ telefone, petId }),
    );
    expect(new Set(nomes).size).toBe(3);
    nomes.forEach((n) => expect(n).toContain(telefone));
  });

  it('sem telefone ele recusa, em vez de inventar um nome que colide', () => {
    expect(() => nomeDoArquivo({ telefone: '' })).toThrow(/telefone/i);
  });
});

describe('🚨 o modo da peça é decidido pela contagem de pets, não por gosto', () => {
  it('uma ou duas fotos vão soltas', () => {
    expect(modoDaPeca(1)).toBe('two');
    expect(modoDaPeca(2)).toBe('two');
  });

  it('três ou mais viram tira de referência', () => {
    expect(modoDaPeca(3)).toBe('collage');
    expect(modoDaPeca(5)).toBe('collage');
  });
});

describe('o prompt conta ao modelo o que ele está recebendo', () => {
  const pets = (n) =>
    Array.from({ length: n }, (_, i) => ({ nome: `Pet${i + 1}`, foto: `https://x/${i}` }));

  it('com dois pets, três imagens vão no request', () => {
    const p = montarPrompt({ pets: pets(2), modo: 'two', textoDaArte: '', descricaoFotos: '' });
    expect(p).toContain('You are given 3 images');
  });

  it('🚨 com tira, o request tem DUAS imagens e o modelo é avisado dos painéis', () => {
    const p = montarPrompt({ pets: pets(3), modo: 'collage', textoDaArte: '', descricaoFotos: '' });
    expect(p).toContain('You are given 2 images');
    expect(p).toContain('REFERENCE STRIP');
    // Sem esta linha o modelo trata a colagem como um bicho só e devolve uma
    // quimera com pedaços dos três.
    expect(p).toContain('3 SEPARATE pets');
  });

  it('🚨 declara EXATAMENTE quantos pets a peça tem, em todo modo', () => {
    // Medido em 27/08: uma casa de um pet voltou com dois cachorros na peça, com
    // o mesmo prompt que antes tinha devolvido um só. Sem contagem declarada,
    // quantos animais aparecem é sorteio.
    expect(montarPrompt({ pets: pets(1), modo: 'two', textoDaArte: '', descricaoFotos: '' })).toContain(
      'EXACTLY 1 pet, no more and no fewer',
    );
    expect(montarPrompt({ pets: pets(2), modo: 'two', textoDaArte: '', descricaoFotos: '' })).toContain(
      'EXACTLY 2 pets, no more and no fewer',
    );
    expect(
      montarPrompt({ pets: pets(3), modo: 'collage', textoDaArte: '', descricaoFotos: '' }),
    ).toContain('EXACTLY 3 pets, no more and no fewer');
  });

  it('🚨 o nome do pet entra como CONTEXTO, com a proibição colada', () => {
    const p = montarPrompt({ pets: pets(1), modo: 'two', textoDaArte: '', descricaoFotos: '' });
    expect(p).toContain('For context only');
    // A linha antiga (`The pet names, if the scene shows any: X.`) convidava o
    // modelo a escrever, e ele escreveu: em 27/08 a peça saiu com o nome do pet
    // assinado no tapete e na plaquinha da coleira, sem ninguém pedir.
    expect(p).not.toMatch(/The pet names, if the scene shows any/);
    expect(p).toMatch(/Do NOT write these names, or any other text, anywhere in the image/);
  });

  it('🚨 manda PRESERVAR o texto da parede, nunca escrevê-lo', () => {
    const p = montarPrompt({
      pets: pets(1),
      modo: 'two',
      textoDaArte: 'Feliz dia mundial do cachorro',
      descricaoFotos: '',
    });
    expect(p).toContain('pixel for pixel');
    expect(p).toContain('Do NOT add any new text of your own');
    expect(p).toContain('Feliz dia mundial do cachorro');
  });
});

describe('🚨 o lote só roda a partir de uma direção aprovada', () => {
  beforeEach(() => vi.clearAllMocks());

  it('campanha sem direção aprovada é recusada, com o que fazer escrito', async () => {
    query.mockResolvedValueOnce([{ producao: { fundo: 'cena.png', descricaoFotos: 'oi' } }]);
    const r = await iniciarLote('camp-1');
    expect(r.erro).toBe('DIRECAO_NAO_APROVADA');
    expect(r.mensagem).toMatch(/aprove/i);
  });

  it('campanha que não existe é 404, não erro de direção', async () => {
    query.mockResolvedValueOnce([]);
    expect((await iniciarLote('camp-x')).erro).toBe('CAMPAIGN_NOT_FOUND');
  });

  it('🚨 a receita usada é a CONGELADA, não o que está vivo no formulário', async () => {
    query.mockResolvedValueOnce([
      {
        producao: {
          // o operador editou a descrição DEPOIS de aprovar
          descricaoFotos: 'texto novo que ninguém aprovou',
          textoDaArte: 'grafia nova',
          fundo: 'outro-fundo.png',
          direcaoAprovada: {
            url: 'https://s3/amostra.jpg',
            em: '2026-08-27T10:00:00.000Z',
            receita: {
              fundo: 'cena-aprovada.png',
              descricaoFotos: 'o que foi aprovado',
              textoDaArte: 'Feliz dia mundial do cachorro',
              escopo: 'tutor',
            },
          },
        },
      },
    ]);

    const { receita } = await lerDirecaoAprovada('camp-1');

    expect(receita.fundo).toBe('cena-aprovada.png');
    expect(receita.descricaoFotos).toBe('o que foi aprovado');
    expect(receita.textoDaArte).toBe('Feliz dia mundial do cachorro');
  });
});

describe('a retentativa espera, e o fracasso deixa o motivo escrito', () => {
  const peca = {
    id: 'peca-1',
    cell_phone: '5531999300962',
    pet_owner_id: null,
    pets: [{ nome: 'Bilbo', foto: 'https://x/1' }],
    arquivo: 't5531999300962.jpg',
    tentativas: 0,
  };
  const receita = { fundo: 'cena.png', descricaoFotos: '', textoDaArte: '' };

  /** Recolhe o último valor gravado em cada coluna, lendo os UPDATEs. */
  const gravado = () => {
    const estado = {};
    for (const [sql, opcoes] of query.mock.calls) {
      if (!/UPDATE campaign_pieces SET/.test(sql)) continue;
      Object.assign(estado, opcoes.replacements);
    }
    return estado;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    query.mockResolvedValue([]);
  });

  it('🚨 espera 4s, 8s e 12s entre as tentativas, nunca zero', async () => {
    const esperou = [];
    gerarPeca.mockRejectedValue(new Error('fetch failed'));

    await produzirPeca({
      peca,
      campaignId: 'camp-1',
      receita,
      aguardar: async (ms) => esperou.push(ms),
    });

    expect(esperou).toEqual([4000, 8000, 12000]);
    expect(esperou).toEqual(ESPERAS);
    // Quatro tentativas: a primeira mais uma por espera.
    expect(gerarPeca).toHaveBeenCalledTimes(4);
  });

  it('a falha de transporte que passa na 3ª tentativa termina PRONTA', async () => {
    gerarPeca
      .mockRejectedValueOnce(new Error('fetch failed'))
      .mockRejectedValueOnce(new Error('fetch failed'))
      .mockResolvedValueOnce({ url: 'https://s3/peca.jpg', modo: 'two' });

    const r = await produzirPeca({ peca, campaignId: 'camp-1', receita, aguardar: async () => {} });

    expect(r.ok).toBe(true);
    const estado = gravado();
    expect(estado.status).toBe('pronta');
    expect(estado.url).toBe('https://s3/peca.jpg');
    expect(estado.erro).toBe(null);
    expect(estado.tentativas).toBe(3);
  });

  it('🚨 quando desiste, o motivo fica gravado — peça muda não é revisável', async () => {
    gerarPeca.mockRejectedValue(new Error('modelo respondeu HTTP 429: quota'));

    const r = await produzirPeca({ peca, campaignId: 'camp-1', receita, aguardar: async () => {} });

    expect(r.ok).toBe(false);
    const estado = gravado();
    expect(estado.status).toBe('erro');
    expect(estado.erro).toMatch(/429/);
  });

  it('a peça gerada grava no arquivo DELA, com a receita congelada', async () => {
    gerarPeca.mockResolvedValue({ url: 'https://s3/p.jpg', modo: 'two' });

    await produzirPeca({ peca, campaignId: 'camp-1', receita, aguardar: async () => {} });

    expect(gerarPeca).toHaveBeenCalledWith(
      expect.objectContaining({ arquivo: 't5531999300962.jpg', producao: receita }),
    );
  });
});
