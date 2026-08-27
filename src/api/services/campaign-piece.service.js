/* ============================================================================
 * A PEÇA DA CAMPANHA
 * ============================================================================
 *
 * Uma função gera a peça, e ela serve os dois momentos da Produção:
 *
 *   - a AMOSTRA, uma peça só, pra aprovar a direção de arte;
 *   - o LOTE, a mesma direção replicada pro público congelado inteiro.
 *
 * 🚨 É de propósito que seja a MESMA função. Amostra e lote por caminhos
 * diferentes seria aprovar uma direção e mandar outra: bastaria um detalhe do
 * prompt divergir pra peça aprovada não ser a peça enviada, e a divergência só
 * apareceria depois do disparo. Aqui o que muda entre os dois é o nome do
 * arquivo, nada mais.
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
import {
  garantirJpeg,
  montarTira,
  lerCabeca,
  identificarFormato,
} from './campaign-image.service.js';
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
 * 🚨 QUANTAS IMAGENS VÃO NO REQUEST, e por quê.
 *
 * Com 4 imagens (cena + 3 fotos) o modelo perde a âncora e re-renderiza tudo:
 * paleta trocada e o lettering da parede com grafia ERRADA. Medido duas vezes
 * em 26/08. Com 1 ou 2 fotos não acontece.
 *
 * Então 3 pets ou mais viram uma TIRA DE REFERÊNCIA — as N fotos lado a lado
 * numa imagem só — e o request volta pra duas imagens. Não é escolha de
 * composição: é consequência da contagem de pets.
 *
 * Do público real medido em 27/08 (72 casas): 50 têm um pet, 17 têm dois, e 5
 * têm três. Nenhuma tem quatro. A tira serve essas cinco.
 */
export const modoDaPeca = (qtdPets) => (qtdPets >= 3 ? 'collage' : 'two');

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

export const montarPrompt = ({ descricaoFotos, textoDaArte, pets, modo }) => {
  const n = pets.length;
  const nomes = pets.map((p) => p.nome).filter(Boolean);
  const tira = modo === 'collage';

  // 🚨 Na tira o modelo recebe DUAS imagens mesmo com N pets, e ele precisa
  // saber que a segunda tem N painéis — senão trata a colagem como um bicho só
  // e devolve um animal quimera com pedaços dos três.
  const refs = tira ? `IMAGE 2` : n === 1 ? `IMAGE 2` : `IMAGES 2 to ${n + 1}`;
  const totalImagens = tira ? 2 : n + 1;

  const blocos = [
    [
      `You are given ${totalImagens} images. IMAGE 1 is the scene.`,
      tira
        ? `IMAGE 2 is a REFERENCE STRIP: ${n} real photos of the tutor's ${n} different pets, placed side by side from left to right${
            nomes.length === n ? `, in this order: ${nomes.join(', ')}` : ''
          }. Each panel is a DIFFERENT animal.`
        : `${refs} ${n === 1 ? `is a real photo` : `are real photos`} of the tutor's ${
            n === 1 ? `pet` : `pets`
          }.`,
      `Use ${tira || n > 1 ? `them` : `it`} ONLY as reference for what the ${
        n === 1 ? `pet looks` : `pets look`
      } like.`,
    ],
    [
      `PET APPEARANCE (CRITICAL, highest priority):`,
      // 🚨 A CONTAGEM É DITA, E ELA É DITA SEMPRE.
      //
      // Medido em 27/08: uma casa de UM pet voltou com DOIS cachorros na peça,
      // quase idênticos, com o mesmo prompt que na rodada anterior tinha
      // devolvido um só. Sem número declarado, quantos animais aparecem é
      // sorteio — e "olha o seu cachorro" com um cachorro a mais é peça errada
      // que passa por qualquer checagem de dimensão, peso e detecção de pet.
      `- The final image must contain EXACTLY ${n} ${n === 1 ? `pet` : `pets`}, no more and no fewer. Do NOT duplicate, mirror or add any extra animal.`,
      `- Study ${refs} with extreme attention. Each generated pet MUST be a faithful reproduction of that real, specific animal.`,
      ...(tira
        ? [
            `- IMAGE 2 contains ${n} SEPARATE pets, one per panel. Render all ${n} of them. Do NOT merge them into a single animal and do NOT repeat the same animal twice.`,
          ]
        : []),
      `- Preserve EXACTLY: breed, face structure, eye color and shape, ear shape and position, nose, muzzle, fur color with all gradients, all markings, fur length and texture, body proportions, tail, paw color.`,
      `- Do NOT idealize, beautify or "fix" the pet. Do NOT substitute a generic good-looking pet of the same breed.`,
    ],
    [
      `SCENE PRESERVATION:`,
      `- Keep the background, props, lighting and framing EXACTLY as in IMAGE 1.`,
      `- Do NOT invent, add, remove or modify any background element.`,
      ...(tira
        ? [
            `- IMAGE 2 is reference material only. Do NOT copy its layout, its panel borders or its backgrounds into the final image.`,
          ]
        : []),
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
    // 🚨 OS NOMES ENTRAM COMO CONTEXTO, E COM A PROIBIÇÃO COLADA.
    //
    // A linha anterior era `The pet names, if the scene shows any: Ursa.`, e ela
    // CONVIDAVA o modelo a escrever. Medido em 27/08, nas quatro peças do
    // primeiro lote de prova: a peça da Ursa saiu com "Ursa" assinado no tapete,
    // e a do Glub com o nome na plaquinha da coleira. Nenhum dos dois foi
    // pedido, e os dois contradizem o bloco de lettering logo acima.
    //
    // É a mesma família do "caschorho" de 26/08: texto que o modelo escreve por
    // conta própria é texto que ninguém revisou, e numa peça que vai pra 69
    // casas o nome escrito errado é pior que nome nenhum.
    nomes.length
      ? [
          `For context only, the tutor's ${nomes.length === 1 ? `pet is` : `pets are`} named ${nomes.join(
            `, `,
          )}. Do NOT write these names, or any other text, anywhere in the image.`,
        ]
      : [],
    [`The final image must look like an actual photograph taken with a professional camera.`],
  ];

  return blocos
    .map((linhas) => linhas.filter(Boolean).join(LINHA))
    .filter(Boolean)
    .join(LINHA + LINHA);
};

/**
 * 🚨 O FUNDO NÃO PASSA PELO CONVERSOR DE FOTO, e a diferença entre os dois
 * caminhos é a razão de existir dos dois.
 *
 * O conversor existe porque a FOTO DO PET chega de um iPhone qualquer, em HEIC
 * rotulada como jpeg, e o modelo inventa um cachorro quando não decodifica. O
 * fundo é outra coisa: ele é um arquivo que o operador acabou de escolher, e o
 * formato natural dele é PNG — o `dogday_1pet.png` que rodou em 26/08 é PNG.
 *
 * Mandar o fundo pelo mesmo caminho da foto quebrou a geração inteira com
 * "foto em png, que não temos como converter", e o defeito só apareceu quando a
 * tela foi exercitada com o fundo REAL. O fundo vai como está, com o mime type
 * que os BYTES dizem — nunca o `image/png` fixo de antes, que mentiria pra um
 * fundo salvo em JPEG.
 */
const MIMES = { jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };

const baixarFundo = async (url) => {
  const r = await fetch(url, { signal: AbortSignal.timeout(30000) });
  if (!r.ok) throw new Error(`o fundo respondeu HTTP ${r.status}`);
  const bytes = Buffer.from(await r.arrayBuffer());
  const { formato } = identificarFormato(bytes);
  const mime = MIMES[formato];
  if (!mime) {
    throw new Error(`o fundo está em ${formato}, e o modelo só aceita png, jpeg ou webp`);
  }
  return { base64: bytes.toString('base64'), mime };
};

const chamarModelo = async ({ prompt, fundoBase64, fundoMime, fotosBase64 }) => {
  const chave = chaveGemini();
  if (!chave) throw new Error('GOOGLE_GENERATIVE_AI_API_KEY ausente no ambiente');

  const parts = [
    { text: prompt },
    { inline_data: { mime_type: fundoMime || 'image/png', data: fundoBase64 } },
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
 * 🚨 O NOME DO ARQUIVO NUNCA É FIXO, E NUNCA É INVENTADO.
 *
 * Em 26/08 uma peça foi parar na casa errada porque o nome era fixo: dois
 * workers em paralelo escreveram no mesmo lugar. O telefone é o único dado que
 * já é único por destinatário no momento da geração.
 *
 * Quando a campanha é por PET (uma peça por animal, não por casa), o telefone
 * sozinho deixa de distinguir — três peças da mesma casa colidiriam entre si. Aí
 * entra o id do pet, e o nome continua saindo do telefone, com um sufixo.
 *
 * Quem tem a última palavra é o índice único `(campaign_id, arquivo)` no banco:
 * se esta função algum dia repetir um nome, o INSERT é recusado em vez de a
 * peça ser sobrescrita em silêncio.
 */
export const nomeDoArquivo = ({ telefone, petId }) => {
  const digitos = String(telefone || '').replace(/\D/g, '');
  if (!digitos) throw new Error('peça sem telefone: não há de onde derivar o nome do arquivo');
  return petId ? `t${digitos}-${String(petId).slice(0, 8)}.jpg` : `t${digitos}.jpg`;
};

/**
 * GERA UMA PEÇA. É a função que a amostra e o lote chamam, sem desvio.
 *
 * `arquivo` chega pronto de quem chamou, porque quem sabe se aquilo é amostra ou
 * peça de lote é o caller, e o nome é a única coisa que os distingue.
 */
export const gerarPeca = async ({ campaignId, producao, alvo, arquivo }) => {
  const fundo = producao?.fundo;
  if (!fundo) throw new Error('a campanha ainda não tem fundo');

  const pets = Array.isArray(alvo?.pets) ? alvo.pets : [];
  const fotos = pets.map((p) => p.foto).filter(Boolean);
  if (!fotos.length) throw new Error('nenhum pet desta casa tem foto própria');

  const modo = modoDaPeca(fotos.length);
  const prompt = montarPrompt({
    descricaoFotos: producao.descricaoFotos,
    textoDaArte: producao.textoDaArte,
    pets,
    modo,
  });

  const cena = await baixarFundo(`${BASE}/templates/${fundo}`);

  // 🚨 É aqui que o HEIC morre. `garantirJpeg` decide por magic bytes e converte
  // antes de a foto chegar no modelo. Sem isto, 27 das 99 fotos do público vão
  // rotuladas como jpeg, o modelo não decodifica, NÃO FALHA, e inventa um
  // cachorro plausível.
  //
  // 🚨 E o que foi mandado fica REGISTRADO em `referencias`. O canvas de revisão
  // precisa mostrar a peça ao lado da foto da casa, e navegador nenhum renderiza
  // HEIC: apontando pra origem, a revisão fica cega em 27% da base, justo na
  // fatia onde o modelo inventa cachorro. Aqui sai a URL que o modelo VIU.
  const referencias = [];
  let fotosBase64;

  if (modo === 'collage') {
    const tira = await montarTira(fotos);
    // A tira vai pro S3 pra revisão poder ver a MESMA imagem que o modelo
    // recebeu. Três fotos soltas não são o que entrou, e olhar o que não entrou
    // torna peça de colagem errada impossível de diagnosticar.
    const chaveTira = `campanhas/${campaignId}/tiras/${arquivo}`;
    await s3.uploadFile({
      bucketName: BUCKET,
      filePath: chaveTira,
      fileStream: tira,
      contentType: 'image/jpeg',
    });
    referencias.push({ tipo: 'tira', url: `${BASE}/${chaveTira}` });
    fotosBase64 = [tira.toString('base64')];
  } else {
    const prontas = await Promise.all(fotos.map((f) => garantirJpeg(f)));
    prontas.forEach((r, i) => {
      referencias.push({ tipo: 'foto', nome: pets[i]?.nome ?? null, url: r.url });
    });
    fotosBase64 = prontas.map((r) => r.bytes.toString('base64'));
  }

  const imagem = await chamarModelo({
    prompt,
    fundoBase64: cena.base64,
    fundoMime: cena.mime,
    fotosBase64,
  });

  const key = `campanhas/${campaignId}/${arquivo}`;
  await s3.uploadFile({
    bucketName: BUCKET,
    filePath: key,
    fileStream: Buffer.from(imagem, 'base64'),
    contentType: 'image/jpeg',
  });

  return {
    url: `${BASE}/${key}`,
    arquivo,
    modo,
    imagensNoRequest: 1 + fotosBase64.length,
    referencias,
    alvo: { telefone: alvo?.telefone, pets: pets.map((p) => p.nome) },
    prompt,
    modelo: MODELO,
  };
};

/**
 * A amostra: uma peça só, pra aprovar a direção.
 *
 * O carimbo entra no nome: duas amostras seguidas do mesmo alvo não podem se
 * sobrescrever, senão comparar a anterior com a nova é impossível — e comparar é
 * o trabalho desta etapa. O prefixo `amostra-` também é o que mantém a amostra
 * fora do caminho das peças do lote, que gravam por `t<telefone>.jpg`.
 */
export const gerarAmostra = async ({ campaignId, producao, alvo, carimbo }) => {
  const telefone = String(alvo?.telefone || '').replace(/\D/g, '') || 'sem-telefone';
  return gerarPeca({
    campaignId,
    producao,
    alvo,
    arquivo: `amostra-${telefone}-${carimbo}.jpg`,
  });
};

/**
 * Escolhe sozinho um alvo representativo do público congelado.
 *
 * 🚨 UM PET SÓ, quando existir. Três fotos ou mais mudam o modo da peça pra
 * tira de referência, e aprovar direção numa tira é aprovar uma composição que
 * 50 das 72 casas não vão usar. Quando o operador escolhe o alvo, a escolha dele
 * vale, e a tela avisa o que ele está vendo.
 *
 * 🚨 E FOTO QUE RESPONDA. Antes esta escolha também recusava HEIC, porque HEIC
 * ia cru pro modelo e ele inventava um cachorro. Isso deixou de ser verdade
 * quando a conversão entrou no caminho da geração: HEIC agora é convertida
 * antes, então ela não desqualifica mais ninguém. O que ainda desqualifica é
 * foto que o servidor não entrega — dela não sai peça nenhuma.
 */
export const escolherAlvo = async (campaignId) => {
  const candidatos = await sequelize.query(
    `SELECT cell_phone AS telefone, pet_owner_id, pets
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

    // eslint-disable-next-line no-await-in-loop
    const cabecas = await Promise.all(fotos.map(lerCabeca));
    if (cabecas.every((h) => h && !h.erro)) {
      return { telefone: c.telefone, ownerId: c.pet_owner_id, pets, limpo: true };
    }
  }

  // Nenhum candidato com todas as fotos respondendo: devolve o primeiro e DIZ
  // que não está limpo, pro caller avisar. Silenciar aqui seria o mesmo defeito
  // que este bloco conserta.
  const c = candidatos[0];
  return {
    telefone: c.telefone,
    ownerId: c.pet_owner_id,
    pets: Array.isArray(c.pets) ? c.pets : [],
    limpo: false,
  };
};

export default {
  subirFundo,
  gerarPeca,
  gerarAmostra,
  escolherAlvo,
  nomeDoArquivo,
  modoDaPeca,
  montarPrompt,
};
