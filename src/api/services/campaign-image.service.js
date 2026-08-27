/* ============================================================================
 * A CAMADA DE IMAGEM DA CAMPANHA
 * ============================================================================
 *
 * Duas coisas moram aqui, e as duas existem por causa de defeito MEDIDO em
 * 26/08/2026, na campanha do Dia do Cachorro:
 *
 * 1. **HEIC vira JPEG antes de chegar no modelo.** 27 das 99 fotos do público
 *    elegível são HEIC de iPhone servidas com `Content-Type: image/jpeg`
 *    (medido 27/08 contra prod). O modelo não decodifica HEIC e NÃO FALHA: ele
 *    inventa um cachorro plausível. A peça sai bonita, com o animal de
 *    ninguém, e nada acusa.
 *
 * 2. **3+ fotos viram uma tira de referência.** Com 4 imagens no request
 *    (cena + 3 fotos) o modelo perde a âncora e re-renderiza tudo: paleta
 *    trocada e o lettering da parede com grafia errada ("caschorho",
 *    "cascharho"). Medido duas vezes. A tira devolve o request pra 2 imagens.
 *
 * 🚨 POR QUE JS PURO E NÃO `sharp`. O `sharp` faria isto em três linhas, e foi
 * o que os scripts de 26/08 usaram. Ele é módulo NATIVO: instalar no EC2
 * depende de binário pré-compilado baixar certo, e o `npm install` do deploy é
 * o mesmo pra TODO o backend. Um binário que não resolve às 3 da manhã não
 * derruba a campanha, derruba a API inteira. `jpeg-js` e `heic-convert` são JS
 * puro (o `libheif` deles é emscripten), então o pior caso é a peça falhar, não
 * o deploy.
 *
 * O universo real de formatos é pequeno e foi medido, não suposto: das 99 fotos
 * do público, 72 são JPEG e 27 são HEIC. Zero PNG, zero WebP. Por isso o
 * decodificador cobre esses dois e diz em voz alta quando encontra outra coisa,
 * em vez de tentar adivinhar.
 * ============================================================================ */

import crypto from 'crypto';
import jpeg from 'jpeg-js';
import heicConvert from 'heic-convert';
import s3 from '../../utils/s3.js';

const BUCKET = 'ai-images-n8n';
const BASE = `https://${BUCKET}.s3.sa-east-1.amazonaws.com`;

/**
 * 🚨 O CONTENT-TYPE MENTE. A assinatura é a única testemunha.
 *
 * Medido em 27/08: 29 das 99 fotos do público têm Content-Type que não bate com
 * os bytes, e as 27 HEIC estão todas nesse grupo, servidas como `image/jpeg`.
 * Quem acredita no cabeçalho manda HEIC pro modelo achando que mandou JPEG.
 */
const ASSINATURAS = [
  { magica: /^\xFF\xD8\xFF/, formato: 'jpeg', decodifica: true },
  { magica: /^\x89PNG\r\n\x1a\n/, formato: 'png', decodifica: false },
  { magica: /^RIFF....WEBP/s, formato: 'webp', decodifica: false },
  { magica: /ftyp(heic|heix|mif1|msf1)/, formato: 'heic', decodifica: true },
  { magica: /ftypavif/, formato: 'avif', decodifica: false },
];

export const identificarFormato = (bytes) => {
  const cabeca = Buffer.from(bytes).subarray(0, 32).toString('latin1');
  for (const a of ASSINATURAS) {
    if (a.magica.test(cabeca)) {
      // `precisaConverter` responde "isto serve pro modelo como está?", e a
      // resposta é não pra tudo que não é JPEG. Formato que nem sabemos
      // decodificar também precisa de conversão — só que ela vai falhar, e
      // falhar alto é o comportamento certo.
      return { formato: a.formato, precisaConverter: a.formato !== 'jpeg' };
    }
  }
  return { formato: 'desconhecido', precisaConverter: true };
};

/** Lê só a cabeça do arquivo, por Range: 32 bytes respondem a pergunta inteira. */
export const lerCabeca = async (url) => {
  try {
    const resp = await fetch(url, {
      headers: { Range: 'bytes=0-31' },
      signal: AbortSignal.timeout(8000),
    });
    if (!resp.ok && resp.status !== 206) return { erro: `HTTP ${resp.status}` };
    return {
      ...identificarFormato(Buffer.from(await resp.arrayBuffer())),
      contentType: resp.headers.get('content-type') || null,
    };
  } catch (e) {
    return { erro: e?.name === 'TimeoutError' ? 'timeout' : String(e?.message || e).slice(0, 80) };
  }
};

const baixar = async (url, ms = 30000) => {
  const r = await fetch(url, { signal: AbortSignal.timeout(ms) });
  if (!r.ok) throw new Error(`imagem respondeu HTTP ${r.status}`);
  return Buffer.from(await r.arrayBuffer());
};

const existeNoS3 = async (url) => {
  try {
    const r = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(8000) });
    return r.ok;
  } catch {
    return false;
  }
};

const decodificarJpeg = (bytes) => {
  const img = jpeg.decode(bytes, { useTArray: true, maxMemoryUsageInMB: 1024 });
  return { largura: img.width, altura: img.height, dados: Buffer.from(img.data) };
};

const codificarJpeg = (img, qualidade = 90) =>
  Buffer.from(
    jpeg.encode({ data: img.dados, width: img.largura, height: img.altura }, qualidade).data,
  );

/**
 * Redução por MÉDIA DE ÁREA, não por vizinho mais próximo.
 *
 * Reduzir 4284px pra 1280 pegando um pixel a cada três joga fora dois terços da
 * informação e serrilha o pelo do animal — justo o detalhe que o modelo precisa
 * copiar. A média custa alguns milissegundos a mais e preserva a textura.
 *
 * `recorte` opcional recorta antes de reduzir (é como sai o quadrado da tira).
 */
const reamostrar = (img, larguraAlvo, alturaAlvo, recorte) => {
  const ox = recorte?.x ?? 0;
  const oy = recorte?.y ?? 0;
  const lo = recorte?.largura ?? img.largura;
  const ao = recorte?.altura ?? img.altura;
  const saida = Buffer.alloc(larguraAlvo * alturaAlvo * 4, 255);
  const ex = lo / larguraAlvo;
  const ey = ao / alturaAlvo;

  for (let y = 0; y < alturaAlvo; y += 1) {
    const y0 = oy + Math.floor(y * ey);
    const y1 = Math.min(oy + ao, Math.max(y0 + 1, oy + Math.floor((y + 1) * ey)));
    for (let x = 0; x < larguraAlvo; x += 1) {
      const x0 = ox + Math.floor(x * ex);
      const x1 = Math.min(ox + lo, Math.max(x0 + 1, ox + Math.floor((x + 1) * ex)));
      let r = 0;
      let g = 0;
      let b = 0;
      let n = 0;
      for (let yy = y0; yy < y1; yy += 1) {
        let i = (yy * img.largura + x0) * 4;
        for (let xx = x0; xx < x1; xx += 1) {
          r += img.dados[i];
          g += img.dados[i + 1];
          b += img.dados[i + 2];
          n += 1;
          i += 4;
        }
      }
      const d = (y * larguraAlvo + x) * 4;
      saida[d] = Math.round(r / n);
      saida[d + 1] = Math.round(g / n);
      saida[d + 2] = Math.round(b / n);
      saida[d + 3] = 255;
    }
  }
  return { largura: larguraAlvo, altura: alturaAlvo, dados: saida };
};

/** Recorte central em quadrado (cover) e redução, num passo só. */
const quadrado = (img, lado) => {
  const l = Math.min(img.largura, img.altura);
  return reamostrar(img, lado, lado, {
    x: Math.floor((img.largura - l) / 2),
    y: Math.floor((img.altura - l) / 2),
    largura: l,
    altura: l,
  });
};

// O maior lado do JPEG que sai de um HEIC. O modelo reamostra a entrada pra
// bem menos que isso, e o HEIC convertido cru sai MAIOR que o original (2 MB
// viram 3,5 MB, medido): sem teto, três fotos passam de 10 MB de corpo no
// request por nada.
const LADO_MAXIMO = 1280;

/**
 * 🚨 A CONVERSÃO. Devolve uma URL de JPEG que o modelo consegue ler.
 *
 * Decide por MAGIC BYTES, nunca pelo Content-Type. JPEG passa direto e intacto:
 * re-encodar 72 fotos que já servem só perderia qualidade.
 *
 * O convertido fica no S3 e é reaproveitado. A chave sai do hash da URL de
 * ORIGEM, então é única por foto e estável entre execuções — duas peças da
 * mesma casa, ou duas rodadas do lote, reusam o mesmo arquivo em vez de pagar
 * os ~5s de conversão de novo.
 *
 * 🚨 E ela é única POR FOTO, o que é o oposto do nome fixo que trocou as artes
 * de dono em 26/08. Nome derivado do conteúdo pode ser compartilhado sem risco;
 * o que não pode é nome que não distingue destinatário.
 */
export const garantirJpeg = async (url) => {
  // 🚨 A DECISÃO SAI DE 32 BYTES, e ela vem ANTES de qualquer download inteiro.
  //
  // A primeira versão baixava a foto toda pra só então olhar a assinatura, e o
  // caminho de reaproveitamento ficava com o pior custo do mundo: 13s pra
  // devolver um arquivo que já estava pronto no S3, porque baixava os 2 MB do
  // HEIC de origem antes de descobrir que não precisava dele. Medido em 27/08.
  const cabeca = await lerCabeca(url);
  if (cabeca.erro) throw new Error(`a foto não responde (${cabeca.erro})`);
  const { formato, precisaConverter } = cabeca;

  if (!precisaConverter) {
    return { url, bytes: await baixar(url), formato, convertida: false };
  }
  if (formato !== 'heic') {
    throw new Error(
      `foto em ${formato}, que não temos como converter. Só JPEG e HEIC são lidos aqui.`,
    );
  }

  const chave = `campanhas/convertidas/${crypto.createHash('sha1').update(url).digest('hex')}.jpg`;
  const destino = `${BASE}/${chave}`;

  if (await existeNoS3(destino)) {
    return { url: destino, bytes: await baixar(destino), formato: 'jpeg', convertida: true };
  }

  const bruto = await baixar(url);
  const comoJpeg = Buffer.from(await heicConvert({ buffer: bruto, format: 'JPEG', quality: 0.92 }));
  const img = decodificarJpeg(comoJpeg);
  const maior = Math.max(img.largura, img.altura);
  const reduzida =
    maior > LADO_MAXIMO
      ? reamostrar(
          img,
          Math.round((img.largura * LADO_MAXIMO) / maior),
          Math.round((img.altura * LADO_MAXIMO) / maior),
        )
      : img;
  const bytes = codificarJpeg(reduzida, 92);

  await s3.uploadFile({
    bucketName: BUCKET,
    filePath: chave,
    fileStream: bytes,
    contentType: 'image/jpeg',
  });
  return { url: destino, bytes, formato: 'jpeg', convertida: true };
};

/**
 * 🚨 A TIRA DE REFERÊNCIA: N fotos lado a lado numa imagem só.
 *
 * Existe pra manter o request em DUAS imagens quando a casa tem 3 pets ou mais.
 * Não é escolha de composição: é o que impede o modelo de re-renderizar a
 * parede e escrever "caschorho".
 *
 * Quadrado por recorte central, e não a foto inteira encolhida, porque foto de
 * celular em retrato vira uma faixa fina quando normalizada por altura, e o
 * animal fica pequeno demais pro modelo copiar o focinho.
 */
export const montarTira = async (fotos, { lado = 640 } = {}) => {
  if (!fotos.length) throw new Error('tira sem foto');
  const quadros = [];
  for (const foto of fotos) {
    // Sequencial de propósito: decodificar três fotos de 24 megapixels em
    // paralelo é ~300 MB de RGBA vivo ao mesmo tempo, num processo que também
    // serve a API.
    // eslint-disable-next-line no-await-in-loop
    const { bytes } = await garantirJpeg(foto);
    quadros.push(quadrado(decodificarJpeg(bytes), lado));
  }

  const largura = lado * quadros.length;
  const dados = Buffer.alloc(largura * lado * 4, 255);
  quadros.forEach((q, k) => {
    for (let y = 0; y < lado; y += 1) {
      q.dados.copy(dados, (y * largura + k * lado) * 4, y * lado * 4, (y + 1) * lado * 4);
    }
  });
  return codificarJpeg({ largura, altura: lado, dados }, 90);
};

export default { identificarFormato, lerCabeca, garantirJpeg, montarTira };
