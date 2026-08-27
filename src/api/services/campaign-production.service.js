/* ============================================================================
 * PRODUÇÃO DE CAMPANHA — a conferência que roda ANTES de gerar
 * ============================================================================
 *
 * Esta é a primeira fatia da etapa de Produção, e ela não gera nada. Ela olha o
 * público congelado e responde uma pergunta só: **quais peças vão sair erradas,
 * e por quê**.
 *
 * A ordem é deliberada, e é a mesma que fez o Público vir antes de tudo. Em
 * 26/08/2026, na campanha do Dia do Cachorro, três defeitos de geração custaram
 * pelo menos uma rodada cada. Os três eram detectáveis ANTES de gastar
 * inferência, e nenhum foi detectado porque ninguém olhou. Estas checagens são
 * esse olhar, feito por máquina e antes da conta chegar.
 *
 * 🚨 O QUE ELAS NÃO PEGAM, e por isso a conferência humana continua existindo:
 * o cachorro ser o do tutor certo, e a palavra na parede estar escrita certo.
 * Os dois piores defeitos daquele dia passaram por dimensão, peso e detecção de
 * pet na cena. Nenhuma validação automática substitui o olho aqui.
 * ============================================================================ */

import { sequelize } from '../../config/database.js';
import { QueryTypes } from 'sequelize';

/**
 * 🚨 ARMADILHA 1: HEIC SERVIDO COMO JPEG. O Content-Type do S3 MENTE.
 *
 * 23 das 81 fotos da campanha (em 19 tutores) eram HEIC de iPhone servidas com
 * `Content-Type: image/jpeg`. Os magic bytes diziam `ftypheic`; o cabeçalho HTTP
 * dizia jpeg. Quem acredita no cabeçalho erra.
 *
 * O estrago tem dois tamanhos, e o segundo é o perigoso:
 *
 *   1. Onde o processamento reprova, é BARULHENTO: o tutor cai na lista de
 *      falhas e ninguém manda nada errado.
 *   2. Onde a foto vai DIRETO pro modelo rotulada como jpeg, é SILENCIOSO: se
 *      ele não decodifica, não falha — ele INVENTA um cachorro plausível. A peça
 *      sai bonita, com o cachorro de outra pessoa, e nada acusa.
 *
 * Por isso a checagem lê os BYTES, e lê só os primeiros: um Range de 16 bytes
 * responde a pergunta inteira sem baixar a foto.
 */
const ASSINATURAS = [
  { magica: /^\xFF\xD8\xFF/, formato: 'jpeg', ok: true },
  { magica: /^\x89PNG\r\n\x1a\n/, formato: 'png', ok: true },
  { magica: /^RIFF....WEBP/s, formato: 'webp', ok: true },
  { magica: /ftyp(heic|heix|mif1|msf1)/, formato: 'heic', ok: false },
];

const identificarFormato = (bytes) => {
  const cabeca = bytes.toString('latin1');
  for (const a of ASSINATURAS) {
    if (a.magica.test(cabeca)) return { formato: a.formato, precisaConverter: !a.ok };
  }
  return { formato: 'desconhecido', precisaConverter: false };
};

/**
 * Lê só a cabeça do arquivo, por Range.
 *
 * Devolve `null` quando a foto não responde — e `null` NÃO é "está tudo bem".
 * Foto que o servidor não entrega é peça que não vai sair, e o funil diz isso em
 * voz alta em vez de deixar a falha aparecer na hora da geração.
 */
export const lerCabeca = async (url) => {
  try {
    const resp = await fetch(url, {
      headers: { Range: 'bytes=0-31' },
      signal: AbortSignal.timeout(8000),
    });
    if (!resp.ok && resp.status !== 206) return { erro: `HTTP ${resp.status}` };
    const buf = Buffer.from(await resp.arrayBuffer());
    return {
      ...identificarFormato(buf),
      contentType: resp.headers.get('content-type') || null,
    };
  } catch (e) {
    return { erro: e?.name === 'TimeoutError' ? 'timeout' : String(e?.message || e).slice(0, 80) };
  }
};

/** Concorrência modesta: são dezenas de fotos e o S3 não é o gargalo do dia. */
const emLotes = async (itens, n, fn) => {
  const saida = [];
  for (let i = 0; i < itens.length; i += n) {
    saida.push(...(await Promise.all(itens.slice(i, i + n).map(fn))));
  }
  return saida;
};

/**
 * 🚨 ARMADILHA 2: 3+ FOTOS NO REQUEST QUEBRAM A CENA.
 *
 * Com 4 imagens (cena + 3 fotos) o modelo perde a âncora e re-renderiza tudo:
 * paleta trocada e o lettering da parede com grafia ERRADA ("caschorho",
 * "cascharho"). Medido duas vezes em 26/08.
 *
 * A saída é uma TIRA DE REFERÊNCIA: as N fotos lado a lado numa imagem só,
 * devolvendo o request pra duas imagens. Por isso o modo não é escolha de
 * gosto, é consequência da contagem de pets.
 */
const modoDaPeca = (qtdPets) => {
  if (qtdPets <= 1)
    return { modo: 'two', imagensNoRequest: 2, porque: 'uma foto só, o modelo mantém a âncora' };
  if (qtdPets === 2)
    return {
      modo: 'two',
      imagensNoRequest: 3,
      porque: 'duas fotos ainda cabem sem quebrar a cena',
    };
  return {
    modo: 'collage',
    imagensNoRequest: 2,
    porque: `${qtdPets} pets viram uma tira de referência: 3+ fotos soltas quebram o lettering`,
  };
};

/**
 * 🚨 ARMADILHA 3: NOME DE ARQUIVO FIXO EM PARALELO TROCA AS ARTES DE DONO.
 *
 * Aconteceu à mão em 26/08 (a peça de um tutor foi mandada pra outro) e quase
 * aconteceu em escala: com nome fixo, dois workers escrevem no MESMO arquivo.
 *
 * O nome sai SEMPRE derivado do telefone. Não é sugestão: é o único dado que já
 * é único por destinatário no momento da geração.
 */
const nomeDoArquivo = (telefone) => `t${String(telefone).replace(/\D/g, '')}.jpg`;

export const conferenciaPreVoo = async (campaignId) => {
  const tutores = await sequelize.query(
    `SELECT pet_owner_id, cell_phone, pets
       FROM campaign_audience
      WHERE campaign_id = :id
      ORDER BY cell_phone`,
    { type: QueryTypes.SELECT, replacements: { id: campaignId } },
  );

  const linhas = await emLotes(tutores, 6, async (t) => {
    const pets = Array.isArray(t.pets) ? t.pets : [];
    const fotos = await Promise.all(
      pets.map(async (p) => ({
        pet: p.nome,
        url: p.foto || null,
        ...(p.foto ? await lerCabeca(p.foto) : { erro: 'sem foto' }),
      })),
    );

    const heic = fotos.filter((f) => f.precisaConverter);
    const quebradas = fotos.filter((f) => f.erro);
    // O Content-Type mentiu quando ele diz jpeg e os bytes dizem outra coisa.
    const mentiram = fotos.filter(
      (f) => f.formato && f.contentType && !f.contentType.includes(f.formato),
    );

    const plano = modoDaPeca(pets.length);
    const impede = quebradas.length > 0;

    return {
      telefone: t.cell_phone,
      arquivo: nomeDoArquivo(t.cell_phone),
      pets: pets.map((p) => p.nome),
      ...plano,
      fotos,
      alertas: [
        ...(heic.length
          ? [
              {
                tipo: 'heic',
                grave: true,
                texto: `${heic.length} foto(s) em HEIC. Converta antes: mandar assim faz o modelo inventar um pet.`,
              },
            ]
          : []),
        // 🚨 Só quando NÃO há HEIC. Um HEIC servido como jpeg já É um
        // Content-Type que mente, e as duas linhas juntas contam o mesmo fato
        // duas vezes — o operador lê dois problemas onde existe um. Fora do
        // caso HEIC a divergência ainda vale ser dita: é sinal de upload
        // estranho, mas não impede a peça.
        ...(mentiram.length && !heic.length
          ? [
              {
                tipo: 'content_type',
                grave: false,
                texto: `${mentiram.length} foto(s) com Content-Type que não bate com os bytes.`,
              },
            ]
          : []),
        ...(quebradas.length
          ? [
              {
                tipo: 'foto_indisponivel',
                grave: true,
                texto: `${quebradas.length} foto(s) não respondem (${quebradas
                  .map((f) => f.erro)
                  .join(', ')}).`,
              },
            ]
          : []),
      ],
      pronta: !impede && heic.length === 0,
    };
  });

  const conta = (fn) => linhas.filter(fn).length;
  return {
    total: linhas.length,
    prontas: conta((l) => l.pronta),
    comHeic: conta((l) => l.alertas.some((a) => a.tipo === 'heic')),
    comFotoQuebrada: conta((l) => l.alertas.some((a) => a.tipo === 'foto_indisponivel')),
    porModo: {
      two: conta((l) => l.modo === 'two'),
      collage: conta((l) => l.modo === 'collage'),
    },
    // Os nomes de arquivo TÊM que ser todos distintos. Se dois colidirem, duas
    // peças gravam no mesmo lugar e uma casa recebe a arte da outra.
    nomesUnicos: new Set(linhas.map((l) => l.arquivo)).size === linhas.length,
    linhas,
  };
};

export default { conferenciaPreVoo };
