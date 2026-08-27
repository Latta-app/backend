// A montagem do request que vai pro modelo: fundo, fotos e o arquivo de saída.
//
// ── O ALCANCE ──────────────────────────────────────────────────────────────
// PEGA:
//   · 🚨 o FUNDO passando pelo conversor de foto. Ele é PNG (o dogday_1pet.png
//     que rodou em 26/08 é PNG) e o conversor só lê JPEG e HEIC, então rotear
//     os dois pelo mesmo caminho derruba a geração INTEIRA com "foto em png,
//     que não temos como converter". Aconteceu em 27/08, e só apareceu quando a
//     tela foi exercitada com o fundo real — nenhum teste de unidade anterior
//     tinha um fundo de verdade dentro;
//   · mime type do fundo fixo em image/png, que mente pra um fundo salvo em
//     JPEG e faz o modelo receber bytes rotulados errado;
//   · 🚨 as três fotos de uma casa indo SOLTAS no request. É a armadilha 2:
//     com 4 imagens o modelo re-renderiza o lettering e escreve "caschorho";
//   · a foto HEIC do tutor chegando crua no modelo;
//   · a peça gravando num arquivo que não é o dela.
// NÃO PEGA:
//   · o que o modelo devolve. Isso é o canvas de revisão, e é humano.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import jpeg from 'jpeg-js';

vi.mock('../../config/database.js', () => ({ sequelize: { query: vi.fn(async () => []) } }));

const uploadFile = vi.fn(async () => ({}));
vi.mock('../../utils/s3.js', () => ({ default: { uploadFile: (...a) => uploadFile(...a) } }));

const heicConvert = vi.fn();
vi.mock('heic-convert', () => ({ default: (...a) => heicConvert(...a) }));

import { gerarPeca } from '../services/campaign-piece.service.js';

// A chave não é o objeto deste teste: sem ela o gerador recusa antes de montar o
// request, e todo assert abaixo morreria por um motivo que não é o dele.
process.env.GOOGLE_GENERATIVE_AI_API_KEY = 'chave-de-teste';

const jpegDeVerdade = (l = 40, a = 60, tom = 120) => {
  const dados = Buffer.alloc(l * a * 4, 255);
  for (let i = 0; i < l * a; i += 1) {
    dados[i * 4] = tom;
    dados[i * 4 + 1] = 255 - tom;
    dados[i * 4 + 2] = tom;
  }
  return Buffer.from(jpeg.encode({ data: dados, width: l, height: a }, 90).data);
};

/** Uma cabeça de PNG de verdade: a assinatura de 8 bytes. */
const png = () =>
  Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    Buffer.alloc(256, 3),
  ]);

const heic = () => {
  const b = Buffer.alloc(512, 0);
  b.write('ftypheic', 4, 'latin1');
  return b;
};

const BASE = 'https://ai-images-n8n.s3.sa-east-1.amazonaws.com';

/** O corpo do request que chegou no modelo. */
const requestDoModelo = () => {
  const chamada = global.fetch.mock.calls.find(([u]) =>
    String(u).includes('generativelanguage'),
  );
  return chamada ? JSON.parse(chamada[1].body) : null;
};

const servir = (mapa) => {
  global.fetch = vi.fn(async (url, opcoes = {}) => {
    const alvo = String(url);
    if (alvo.includes('generativelanguage')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          candidates: [
            { content: { parts: [{ inlineData: { data: Buffer.from('peca').toString('base64') } }] } },
          ],
        }),
      };
    }
    const bytes = mapa[alvo];
    if (!bytes) return { ok: false, status: 404, headers: { get: () => null } };
    if (opcoes.method === 'HEAD') return { ok: false, status: 404 };
    const recorte = opcoes.headers?.Range ? bytes.subarray(0, 32) : bytes;
    return {
      ok: true,
      status: opcoes.headers?.Range ? 206 : 200,
      // 🚨 O Content-Type MENTE aqui de propósito: é o que prod faz.
      headers: { get: () => 'image/jpeg' },
      arrayBuffer: async () =>
        recorte.buffer.slice(recorte.byteOffset, recorte.byteOffset + recorte.length),
    };
  });
};

const FUNDO = `${BASE}/templates/dogday_1pet.png`;

describe('gerarPeca monta o request', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    heicConvert.mockImplementation(async () => jpegDeVerdade(30, 30, 200));
  });

  it('🚨 o fundo PNG passa INTACTO, com o mime que os bytes dizem', async () => {
    const foto = `${BASE}/55/a_original`;
    servir({ [FUNDO]: png(), [foto]: jpegDeVerdade() });

    await gerarPeca({
      campaignId: 'camp-1',
      producao: { fundo: 'dogday_1pet.png', descricaoFotos: 'x', textoDaArte: 'y' },
      alvo: { telefone: '5531999300962', pets: [{ nome: 'Bilbo', foto }] },
      arquivo: 't5531999300962.jpg',
    });

    const partes = requestDoModelo().contents[0].parts;
    expect(partes[1].inline_data.mime_type).toBe('image/png');
    expect(partes[1].inline_data.data).toBe(png().toString('base64'));
    // O fundo NÃO virou jpeg pelo caminho, e nada foi convertido.
    expect(heicConvert).not.toHaveBeenCalled();
  });

  it('fundo salvo em JPEG vai rotulado como JPEG, não como png fixo', async () => {
    const foto = `${BASE}/55/a_original`;
    const fundoJpeg = `${BASE}/templates/cena.jpg`;
    servir({ [fundoJpeg]: jpegDeVerdade(20, 20, 30), [foto]: jpegDeVerdade() });

    await gerarPeca({
      campaignId: 'camp-1',
      producao: { fundo: 'cena.jpg' },
      alvo: { telefone: '5531999300962', pets: [{ nome: 'Bilbo', foto }] },
      arquivo: 't5531999300962.jpg',
    });

    expect(requestDoModelo().contents[0].parts[1].inline_data.mime_type).toBe('image/jpeg');
  });

  it('🚨 casa com 3 pets manda DUAS imagens, não quatro', async () => {
    const fotos = ['a', 'b', 'c'].map((n) => `${BASE}/55/${n}_original`);
    servir({
      [FUNDO]: png(),
      [fotos[0]]: jpegDeVerdade(60, 40, 10),
      [fotos[1]]: jpegDeVerdade(40, 60, 120),
      [fotos[2]]: jpegDeVerdade(50, 50, 240),
    });

    const r = await gerarPeca({
      campaignId: 'camp-1',
      producao: { fundo: 'dogday_1pet.png' },
      alvo: {
        telefone: '5531996155934',
        pets: fotos.map((foto, i) => ({ nome: `Pet${i}`, foto })),
      },
      arquivo: 't5531996155934.jpg',
    });

    expect(r.modo).toBe('collage');
    expect(r.imagensNoRequest).toBe(2);
    expect(requestDoModelo().contents[0].parts.filter((p) => p.inline_data)).toHaveLength(2);
  });

  it('casa com 2 pets manda as duas fotos soltas, que é o que o modelo aguenta', async () => {
    const fotos = ['a', 'b'].map((n) => `${BASE}/55/${n}_original`);
    servir({ [FUNDO]: png(), [fotos[0]]: jpegDeVerdade(), [fotos[1]]: jpegDeVerdade(30, 30, 8) });

    const r = await gerarPeca({
      campaignId: 'camp-1',
      producao: { fundo: 'dogday_1pet.png' },
      alvo: { telefone: '5511951005503', pets: fotos.map((foto, i) => ({ nome: `P${i}`, foto })) },
      arquivo: 't5511951005503.jpg',
    });

    expect(r.modo).toBe('two');
    expect(requestDoModelo().contents[0].parts.filter((p) => p.inline_data)).toHaveLength(3);
  });

  it('🚨 a foto HEIC do tutor é convertida antes de chegar no modelo', async () => {
    const foto = `${BASE}/551152950227/x_original`;
    servir({ [FUNDO]: png(), [foto]: heic() });

    await gerarPeca({
      campaignId: 'camp-1',
      producao: { fundo: 'dogday_1pet.png' },
      alvo: { telefone: '551152950227', pets: [{ nome: 'Ursa', foto }] },
      arquivo: 't551152950227.jpg',
    });

    expect(heicConvert).toHaveBeenCalledOnce();
    const enviada = requestDoModelo().contents[0].parts[2].inline_data.data;
    // O que chega no modelo é JPEG de verdade, nunca os bytes HEIC.
    expect(Buffer.from(enviada, 'base64').subarray(0, 3).toString('hex')).toBe('ffd8ff');
  });

  it('a peça grava no arquivo que recebeu, dentro da pasta da campanha', async () => {
    const foto = `${BASE}/55/a_original`;
    servir({ [FUNDO]: png(), [foto]: jpegDeVerdade() });

    const r = await gerarPeca({
      campaignId: 'camp-9',
      producao: { fundo: 'dogday_1pet.png' },
      alvo: { telefone: '5531999300962', pets: [{ nome: 'Bilbo', foto }] },
      arquivo: 't5531999300962.jpg',
    });

    const subida = uploadFile.mock.calls.at(-1)[0];
    expect(subida.filePath).toBe('campanhas/camp-9/t5531999300962.jpg');
    expect(r.url).toContain('campanhas/camp-9/t5531999300962.jpg');
  });

  it('🚨 registra a referência CONVERTIDA, que é o que a revisão consegue exibir', async () => {
    const foto = `${BASE}/551152950227/x_original`;
    servir({ [FUNDO]: png(), [foto]: heic() });

    const r = await gerarPeca({
      campaignId: 'camp-1',
      producao: { fundo: 'dogday_1pet.png' },
      alvo: { telefone: '551152950227', pets: [{ nome: 'Ursa', foto }] },
      arquivo: 't551152950227.jpg',
    });

    expect(r.referencias).toHaveLength(1);
    expect(r.referencias[0]).toMatchObject({ tipo: 'foto', nome: 'Ursa' });
    // A referência NÃO pode ser a URL de origem: ela é HEIC, e o navegador do
    // revisor não renderiza HEIC. Sem isto o canvas fica cego em 27% da base.
    expect(r.referencias[0].url).not.toBe(foto);
    expect(r.referencias[0].url).toContain('campanhas/convertidas/');
  });

  it('🚨 na colagem, a referência é a TIRA que entrou no request', async () => {
    const fotos = ['a', 'b', 'c'].map((n) => `${BASE}/55/${n}_original`);
    servir({
      [FUNDO]: png(),
      [fotos[0]]: jpegDeVerdade(60, 40, 10),
      [fotos[1]]: jpegDeVerdade(40, 60, 120),
      [fotos[2]]: jpegDeVerdade(50, 50, 240),
    });

    const r = await gerarPeca({
      campaignId: 'camp-7',
      producao: { fundo: 'dogday_1pet.png' },
      alvo: { telefone: '5531996155934', pets: fotos.map((foto, i) => ({ nome: `P${i}`, foto })) },
      arquivo: 't5531996155934.jpg',
    });

    expect(r.referencias).toEqual([
      { tipo: 'tira', url: expect.stringContaining('campanhas/camp-7/tiras/t5531996155934.jpg') },
    ]);
    // Três fotos soltas NÃO foram o que entrou. Mostrar o que não entrou torna
    // peça de colagem errada impossível de diagnosticar.
    expect(uploadFile.mock.calls.some(([c]) => c.filePath.includes('/tiras/'))).toBe(true);
  });

  it('casa sem foto nenhuma falha alto, em vez de gerar peça com pet inventado', async () => {
    servir({ [FUNDO]: png() });
    await expect(
      gerarPeca({
        campaignId: 'camp-1',
        producao: { fundo: 'dogday_1pet.png' },
        alvo: { telefone: '5531999300962', pets: [{ nome: 'Bilbo', foto: null }] },
        arquivo: 't5531999300962.jpg',
      }),
    ).rejects.toThrow(/foto/i);
  });
});
