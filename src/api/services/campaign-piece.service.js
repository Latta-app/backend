/* ============================================================================
 * A PEÇA-MODELO DA CAMPANHA
 * ============================================================================
 *
 * A etapa de Produção não gera o lote. Ela produz UMA peça, para o operador
 * aprovar a direção de arte antes de replicar. O lote e a revisão do que saiu
 * são outro momento.
 *
 * Isso muda o custo do erro por duas ordens de grandeza: errar a direção numa
 * amostra custa uma inferência; errar no lote custa 69 e um disparo.
 *
 * 🚨 As DUAS DESCRIÇÕES são separadas de propósito.
 *
 * `descricaoFotos` diz o que fazer com as fotos que os tutores mandaram.
 * `textoDaArte` é o que aparece escrito na peça, e ele merece campo próprio
 * porque é ele que quebrou duas vezes em 26/08: com quatro imagens no request o
 * modelo re-renderizava a parede e escrevia "caschorho", "cascharho". Campo
 * separado é o que permite conferir e travar a grafia sozinha, em vez de caçá-la
 * no meio de um parágrafo de instrução.
 * ============================================================================ */

import { sequelize } from '../../config/database.js';
import { QueryTypes } from 'sequelize';
import { lerCabeca } from './campaign-production.service.js';
import s3 from '../../utils/s3.js';

const BUCKET = 'ai-images-n8n';
const BASE = `https://${BUCKET}.s3.sa-east-1.amazonaws.com`;
// A MESMA do Dia do Cachorro. Há modelos mais novos disponíveis na chave, e
// trocar de modelo troca a direção de arte que já foi aprovada — a escolha é do
// operador, numa rodada própria, nunca um efeito colateral de deploy.
const MODELO = 'gemini-2.5-flash-image';

const chaveGemini = () =>
  process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.GEMINI_API_KEY || '';

const soBase64 = (dado) => String(dado || '').replace(/^data:[^;]+;base64,/, '');

/** Baixa uma imagem e devolve em base64, pro corpo do request do modelo. */
const comoBase64 = async (url) => {
  const r = await fetch(url, { signal: AbortSignal.timeout(20000) });
  if (!r.ok) throw new Error(`imagem ${url.slice(0, 60)} respondeu HTTP ${r.status}`);
  return Buffer.from(await r.arrayBuffer()).toString('base64');
};

/**
 * O fundo da peça, guardado onde o gerador procura.
 *
 * Vai pra `templates/` porque é lá que o resto da casa lê cena de referência
 * (`photo-generator` monta a URL assim). Um fundo em outro prefixo existiria mas
 * não seria alcançável por quem gera.
 */
export const subirFundo = async ({ nomeArquivo, base64, contentType }) => {
  const limpo = String(nomeArquivo || '')
    .replace(/[^A-Za-z0-9._-]/g, '-')
    .slice(0, 80);
  if (!limpo) throw new Error('nome de arquivo vazio');
  const key = `templates/${limpo}`;
  await s3.uploadFile({
    bucketName: BUCKET,
    filePath: key,
    fileStream: Buffer.from(soBase64(base64), 'base64'),
    contentType: contentType || 'image/png',
  });
  return { arquivo: limpo, url: `${BASE}/${key}` };
};

/**
 * Monta o prompt a partir dos dois campos.
 *
 * 🚨 O TEXTO DA ARTE NÃO É ESCRITO PELO MODELO. Ele já está no fundo, e o
 * trabalho do modelo é PRESERVÁ-LO pixel a pixel.
 *
 * Isto foi medido, não deduzido. A primeira versão deste prompt pedia "escreva
 * exatamente este texto" e a peça saiu com o texto do fundo FUNDIDO com o
 * pedido: "Feliz / dia mundial / a do / cachorro", com um "a" solto no meio. É a
 * mesma família do "caschorho" de 26/08 — duas fontes de texto brigando fazem o
 * modelo re-renderizar a parede, e re-renderizar é onde a grafia morre.
 *
 * Então o campo `textoDaArte` mudou de papel: ele DECLARA o que está escrito no
 * fundo, para a conferência ter contra o que comparar. O prompt manda preservar.
 *
 * O andaime é em inglês porque é assim que ele roda em produção desde 26/08. A
 * descrição do operador entra como está: trocar a língua dela seria reescrever o
 * pedido dele.
 */
const LINHA = String.fromCharCode(10);

const montarPrompt = ({ descricaoFotos, textoDaArte, pets }) => {
  const n = pets.length;
  const nomes = pets.map((p) => p.nome).filter(Boolean);
  const refs = n === 1 ? `IMAGE 2` : `IMAGES 2 to ${n + 1}`;

  const blocos = [
    [
      `You are given ${n + 1} images. IMAGE 1 is the scene. ${refs} ${
        n === 1 ? `is a real photo` : `are real photos`
      } of the tutor's ${n === 1 ? `pet` : `pets`}. Use ${
        n === 1 ? `it` : `them`
      } ONLY as reference for what the ${n === 1 ? `pet looks` : `pets look`} like.`,
    ],
    [
      `PET APPEARANCE (CRITICAL, highest priority):`,
      `- Study ${refs} with extreme attention. Each generated pet MUST be a faithful reproduction of that real, specific animal.`,
      `- Preserve EXACTLY: breed, face structure, eye color and shape, ear shape and position, nose, muzzle, fur color with all gradients, all markings, fur length and texture, body proportions, tail, paw color.`,
      `- Do NOT idealize, beautify or "fix" the pet. Do NOT substitute a generic good-looking pet of the same breed.`,
    ],
    [
      `SCENE PRESERVATION:`,
      `- Keep the background, props, lighting and framing EXACTLY as in IMAGE 1.`,
      `- Do NOT invent, add, remove or modify any background element.`,
    ],
    // 🚨 O bloco que protege a grafia. E o mesmo que rodou em 26/08.
    [
      `WALL LETTERING (CRITICAL):`,
      `- Any text already painted in IMAGE 1 must stay EXACTLY as it is, pixel for pixel. Do NOT redraw, retouch, re-letter, translate or re-spell it. Do NOT change its size or position.`,
      `- Do NOT add any new text of your own.`,
      `- No pet may cover, overlap or hide any part of that text.`,
      textoDaArte
        ? `- For reference, the text in the scene reads: "${String(
            textoDaArte,
          ).trim()}". It must come out identical, character for character.`
        : ``,
    ],
    [String(descricaoFotos || ``).trim()],
    nomes.length ? [`The pet names, if the scene shows any: ${nomes.join(`, `)}.`] : [],
    [`The final image must look like an actual photograph taken with a professional camera.`],
  ];

  return blocos
    .map((linhas) => linhas.filter(Boolean).join(LINHA))
    .filter(Boolean)
    .join(LINHA + LINHA);
};
const chamarModelo = async ({ prompt, fundoBase64, fotosBase64 }) => {
  const chave = chaveGemini();
  if (!chave) throw new Error('GOOGLE_GENERATIVE_AI_API_KEY ausente no ambiente');

  const parts = [
    { text: prompt },
    { inline_data: { mime_type: 'image/png', data: fundoBase64 } },
    ...fotosBase64.map((d) => ({ inline_data: { mime_type: 'image/jpeg', data: d } })),
  ];

  const resp = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODELO}:generateContent?key=${chave}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts }],
        generationConfig: { imageConfig: { aspectRatio: '9:16' } },
      }),
      signal: AbortSignal.timeout(120000),
    },
  );

  const json = await resp.json();
  if (!resp.ok) {
    throw new Error(`modelo respondeu HTTP ${resp.status}: ${JSON.stringify(json).slice(0, 200)}`);
  }
  const imagem = json?.candidates?.[0]?.content?.parts?.find((p) => p.inlineData || p.inline_data);
  const dados = imagem?.inlineData?.data || imagem?.inline_data?.data;
  if (!dados) {
    throw new Error(`o modelo não devolveu imagem: ${JSON.stringify(json).slice(0, 200)}`);
  }
  return dados;
};

/**
 * Gera UMA peça, pra aprovar a direção.
 *
 * 🚨 O alvo tem que ser uma casa de UM pet quando existir. Não é preferência: é
 * a armadilha 2 (3+ fotos no request quebram a cena e o lettering). Aprovar
 * direção numa peça de vários pets é aprovar a composição errada e descobrir o
 * problema no lote. Quando o operador escolhe o alvo, a escolha dele vale, e a
 * tela avisa.
 *
 * 🚨 O nome do arquivo NUNCA é fixo. Em 26/08 nome fixo em paralelo fez a peça
 * de um tutor ir pra outro. Aqui a amostra carrega o telefone e o instante.
 */
export const gerarAmostra = async ({ campaignId, producao, alvo, carimbo }) => {
  const fundo = producao?.fundo;
  if (!fundo) throw new Error('a campanha ainda não tem fundo');

  const pets = Array.isArray(alvo?.pets) ? alvo.pets : [];
  const fotos = pets.map((p) => p.foto).filter(Boolean);

  const prompt = montarPrompt({
    descricaoFotos: producao.descricaoFotos,
    textoDaArte: producao.textoDaArte,
    pets,
  });

  const [fundoBase64, ...fotosBase64] = await Promise.all([
    comoBase64(`${BASE}/templates/${fundo}`),
    ...fotos.map(comoBase64),
  ]);

  const imagem = await chamarModelo({ prompt, fundoBase64, fotosBase64 });

  const telefone = String(alvo?.telefone || 'sem-telefone').replace(/\D/g, '');
  const key = `campanhas/${campaignId}/amostra-${telefone}-${carimbo}.jpg`;
  await s3.uploadFile({
    bucketName: BUCKET,
    filePath: key,
    fileStream: Buffer.from(imagem, 'base64'),
    contentType: 'image/jpeg',
  });

  return {
    url: `${BASE}/${key}`,
    alvo: { telefone, pets: pets.map((p) => p.nome) },
    prompt,
    modelo: MODELO,
  };
};

/**
 * Escolhe sozinho um alvo representativo do público congelado.
 *
 * Duas exigências, e as duas vêm de defeito medido:
 *
 * 🚨 1. UM PET SÓ. Três fotos ou mais quebram a cena e o lettering (armadilha 2
 *    de 26/08). Aprovar direção numa peça de vários pets é aprovar a composição
 *    errada e descobrir o problema no lote.
 *
 * 🚨 2. FOTO QUE O MODELO CONSIGA LER. Este é o que quase passou: a primeira
 *    versão ordenava só por quantidade de pets e escolheu uma casa com foto
 *    HEIC. HEIC vai pro modelo rotulado como jpeg, ele não decodifica, e INVENTA
 *    um cachorro plausível. A amostra sai linda, com um pet que não existe, e o
 *    operador aprova a direção no escuro. Medido na primeira execução da tela:
 *    o alvo sorteado tinha HEIC e a peça voltou com um husky.
 *
 * Por isso a escolha lê os bytes dos candidatos, um por um, e para no primeiro
 * que serve. São poucos requests de 32 bytes, não uma varredura.
 */
export const escolherAlvo = async (campaignId) => {
  const candidatos = await sequelize.query(
    `SELECT cell_phone AS telefone, pets
       FROM campaign_audience
      WHERE campaign_id = :id
      ORDER BY jsonb_array_length(pets), cell_phone
      LIMIT 12`,
    { type: QueryTypes.SELECT, replacements: { id: campaignId } },
  );
  if (!candidatos.length) return null;

  for (const c of candidatos) {
    const pets = Array.isArray(c.pets) ? c.pets : [];
    const fotos = pets.map((p) => p.foto).filter(Boolean);
    if (fotos.length !== pets.length || !fotos.length) continue;

    const cabecas = await Promise.all(fotos.map(lerCabeca));
    const servem = cabecas.every((h) => h && !h.erro && !h.precisaConverter);
    if (servem) return { telefone: c.telefone, pets, limpo: true };
  }

  // Nenhum candidato limpo: devolve o primeiro e DIZ que não está limpo, pro
  // caller avisar. Silenciar aqui seria o mesmo defeito que este bloco conserta.
  const c = candidatos[0];
  return { telefone: c.telefone, pets: Array.isArray(c.pets) ? c.pets : [], limpo: false };
};

export default { subirFundo, gerarAmostra, escolherAlvo };
