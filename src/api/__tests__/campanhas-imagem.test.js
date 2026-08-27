// A camada de imagem da campanha: a conversão de HEIC e a tira de referência.
//
// ── O ALCANCE ──────────────────────────────────────────────────────────────
// PEGA:
//   · 🚨 decisão de formato tomada pelo Content-Type. É o defeito central: 27
//     das 99 fotos do público são HEIC servidas como `image/jpeg`, e quem
//     acredita no cabeçalho manda HEIC pro modelo achando que mandou JPEG. O
//     modelo então NÃO falha — ele inventa um cachorro plausível, a peça sai
//     bonita com o animal de ninguém, e nada acusa. Este é o único guard que
//     enxerga esse caminho, porque em produção ele é silencioso por desenho;
//   · HEIC chegando crua no gerador (a conversão sumir do caminho);
//   · JPEG sendo re-encodada à toa, que perde qualidade nas 72 fotos que já
//     serviam;
//   · formato sem conversor passando calado em vez de falhar alto;
//   · o convertido sendo regerado a cada chamada em vez de reaproveitado do S3
//     (5 s de conversão por foto, vezes 27 fotos, vezes cada rodada do lote);
//   · a tira de referência deixando de ser UMA imagem, que é o que devolve o
//     request pra 2 e impede o modelo de re-renderizar o lettering.
// NÃO PEGA:
//   · se o `libheif` decodifica um HEIC de verdade — o pacote é mockado aqui.
//     Isso foi medido à mão em 27/08 contra duas fotos reais de prod: 2.028 KB
//     de HEIC viraram 287 KB de JPEG legível, e a imagem foi conferida a olho;
//   · se a peça final tem o cachorro certo. Nenhuma máquina pega isso — é o
//     canvas de revisão.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import jpeg from 'jpeg-js';

const uploadFile = vi.fn(async () => ({}));
vi.mock('../../utils/s3.js', () => ({ default: { uploadFile: (...a) => uploadFile(...a) } }));

const heicConvert = vi.fn();
vi.mock('heic-convert', () => ({ default: (...a) => heicConvert(...a) }));

import {
  identificarFormato,
  garantirJpeg,
  montarTira,
} from '../services/campaign-image.service.js';

/** Um JPEG de verdade, pequeno, pro jpeg-js ter o que decodificar. */
const jpegDeVerdade = (largura = 40, altura = 60, tom = 120) => {
  const dados = Buffer.alloc(largura * altura * 4, 255);
  for (let i = 0; i < largura * altura; i += 1) {
    dados[i * 4] = tom;
    dados[i * 4 + 1] = 255 - tom;
    dados[i * 4 + 2] = tom;
  }
  return Buffer.from(jpeg.encode({ data: dados, width: largura, height: altura }, 90).data);
};

/** A cabeça de um HEIC de iPhone: a caixa `ftyp` com a marca `heic`. */
const cabecaHeic = () => {
  const b = Buffer.alloc(64, 0);
  b.write('ftypheic', 4, 'latin1');
  b.write('mif1heic', 16, 'latin1');
  return b;
};

/**
 * Um S3 e um servidor de fotos falsos. `respostas` mapeia url -> {bytes,
 * contentType, existe}.
 *
 * 🚨 O `contentType` daqui MENTE de propósito nos casos de HEIC, porque é
 * exatamente o que prod faz.
 */
const servir = (respostas) => {
  global.fetch = vi.fn(async (url, opcoes = {}) => {
    const alvo = respostas[String(url)];
    if (!alvo) return { ok: false, status: 404, headers: new Map() };
    if (opcoes.method === 'HEAD') return { ok: alvo.existe !== false, status: 200 };
    const bytes = opcoes.headers?.Range ? alvo.bytes.subarray(0, 32) : alvo.bytes;
    return {
      ok: true,
      status: opcoes.headers?.Range ? 206 : 200,
      headers: { get: () => alvo.contentType ?? null },
      arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.length),
    };
  });
};

const FOTO_HEIC = 'https://ai-images-n8n.s3.sa-east-1.amazonaws.com/55119/abc_original';
const FOTO_JPEG = 'https://ai-images-n8n.s3.sa-east-1.amazonaws.com/55119/def_original';

describe('identificarFormato lê os BYTES, não o cabeçalho', () => {
  it('reconhece HEIC pela caixa ftyp', () => {
    expect(identificarFormato(cabecaHeic())).toEqual({ formato: 'heic', precisaConverter: true });
  });

  it('reconhece JPEG e diz que ele não precisa de conversão', () => {
    expect(identificarFormato(jpegDeVerdade())).toEqual({
      formato: 'jpeg',
      precisaConverter: false,
    });
  });

  it('formato que não conhece pede conversão em vez de passar batido', () => {
    expect(identificarFormato(Buffer.from('nao sou imagem nenhuma'))).toEqual({
      formato: 'desconhecido',
      precisaConverter: true,
    });
  });
});

describe('garantirJpeg', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    heicConvert.mockImplementation(async () => jpegDeVerdade(30, 30, 200));
  });

  it('🚨 converte HEIC servida como image/jpeg, que é o caso REAL de prod', async () => {
    const heic = Buffer.concat([cabecaHeic(), Buffer.alloc(512, 7)]);
    servir({ [FOTO_HEIC]: { bytes: heic, contentType: 'image/jpeg', existe: false } });

    const r = await garantirJpeg(FOTO_HEIC);

    expect(heicConvert).toHaveBeenCalledOnce();
    expect(r.convertida).toBe(true);
    expect(r.formato).toBe('jpeg');
    // O que sai TEM que ser JPEG de verdade, não os bytes de entrada renomeados.
    expect(r.bytes.subarray(0, 3).toString('hex')).toBe('ffd8ff');
    expect(r.url).not.toBe(FOTO_HEIC);
    expect(uploadFile).toHaveBeenCalledOnce();
  });

  it('JPEG passa INTACTA, mesmo com Content-Type que não diz jpeg', async () => {
    const bytes = jpegDeVerdade();
    servir({ [FOTO_JPEG]: { bytes, contentType: 'application/octet-stream' } });

    const r = await garantirJpeg(FOTO_JPEG);

    expect(r.convertida).toBe(false);
    expect(r.url).toBe(FOTO_JPEG);
    expect(Buffer.compare(r.bytes, bytes)).toBe(0);
    expect(heicConvert).not.toHaveBeenCalled();
    expect(uploadFile).not.toHaveBeenCalled();
  });

  it('reaproveita o convertido que já está no S3 em vez de reconverter', async () => {
    const heic = Buffer.concat([cabecaHeic(), Buffer.alloc(512, 7)]);
    const pronto = jpegDeVerdade(30, 30, 200);
    // O HEAD do destino responde ok, e o destino serve o JPEG já convertido.
    global.fetch = vi.fn(async (url, opcoes = {}) => {
      if (opcoes.method === 'HEAD') return { ok: true, status: 200 };
      const bytes = String(url) === FOTO_HEIC ? heic : pronto;
      const recorte = opcoes.headers?.Range ? bytes.subarray(0, 32) : bytes;
      return {
        ok: true,
        status: 200,
        headers: { get: () => 'image/jpeg' },
        arrayBuffer: async () =>
          recorte.buffer.slice(recorte.byteOffset, recorte.byteOffset + recorte.length),
      };
    });

    const r = await garantirJpeg(FOTO_HEIC);

    expect(heicConvert).not.toHaveBeenCalled();
    expect(uploadFile).not.toHaveBeenCalled();
    expect(r.convertida).toBe(true);
  });

  it('formato sem conversor falha ALTO, em vez de mandar bytes ilegíveis pro modelo', async () => {
    const webp = Buffer.concat([
      Buffer.from('RIFF'),
      Buffer.alloc(4),
      Buffer.from('WEBPVP8 '),
      Buffer.alloc(64),
    ]);
    servir({ [FOTO_JPEG]: { bytes: webp, contentType: 'image/webp' } });

    await expect(garantirJpeg(FOTO_JPEG)).rejects.toThrow(/webp/i);
  });

  it('foto que não responde vira erro com o motivo, não silêncio', async () => {
    servir({});
    await expect(garantirJpeg(FOTO_JPEG)).rejects.toThrow(/não responde/i);
  });
});

describe('montarTira', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    heicConvert.mockImplementation(async () => jpegDeVerdade(30, 30, 200));
  });

  it('🚨 devolve UMA imagem só, que é o que mantém o request em duas', async () => {
    const a = jpegDeVerdade(80, 40, 10);
    const b = jpegDeVerdade(40, 80, 120);
    const c = jpegDeVerdade(60, 60, 240);
    servir({
      'https://x/a': { bytes: a, contentType: 'image/jpeg' },
      'https://x/b': { bytes: b, contentType: 'image/jpeg' },
      'https://x/c': { bytes: c, contentType: 'image/jpeg' },
    });

    const tira = await montarTira(['https://x/a', 'https://x/b', 'https://x/c'], { lado: 32 });

    expect(tira.subarray(0, 3).toString('hex')).toBe('ffd8ff');
    const decodificada = jpeg.decode(tira, { useTArray: true });
    // Três painéis quadrados lado a lado: 3x a largura, 1x a altura.
    expect(decodificada.height).toBe(32);
    expect(decodificada.width).toBe(96);
  });

  it('converte a HEIC que entra na tira, em vez de deixá-la crua no meio', async () => {
    const heic = Buffer.concat([cabecaHeic(), Buffer.alloc(512, 7)]);
    servir({
      'https://x/heic': { bytes: heic, contentType: 'image/jpeg', existe: false },
      'https://x/jpeg': { bytes: jpegDeVerdade(50, 50, 90), contentType: 'image/jpeg' },
    });

    const tira = await montarTira(['https://x/heic', 'https://x/jpeg'], { lado: 24 });

    expect(heicConvert).toHaveBeenCalledOnce();
    expect(jpeg.decode(tira, { useTArray: true }).width).toBe(48);
  });

  it('tira sem foto nenhuma falha em vez de devolver imagem vazia', async () => {
    await expect(montarTira([])).rejects.toThrow(/sem foto/i);
  });
});
