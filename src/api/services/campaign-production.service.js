/* ============================================================================
 * PRODUÇÃO DE CAMPANHA — a conferência que roda ANTES de gerar
 * ============================================================================
 *
 * Ela não gera nada. Olha o público congelado e responde uma pergunta só:
 * **quais peças vão sair erradas, e por quê**.
 *
 * A ordem é deliberada, e é a mesma que fez o Público vir antes de tudo. Em
 * 26/08/2026, na campanha do Dia do Cachorro, três defeitos de geração custaram
 * pelo menos uma rodada cada. Os três eram detectáveis ANTES de gastar
 * inferência, e nenhum foi detectado porque ninguém olhou. Estas checagens são
 * esse olhar, feito por máquina e antes da conta chegar.
 *
 * 🚨 O QUE ELAS NÃO PEGAM, e por isso a revisão humana continua existindo:
 * o cachorro ser o do tutor certo, e a palavra na parede estar escrita certo.
 * Os dois piores defeitos daquele dia passaram por dimensão, peso e detecção de
 * pet na cena. Nenhuma validação automática substitui o olho aqui.
 *
 * 🚨 O QUE MUDOU EM 27/08: a conferência deixou de TRAVAR por HEIC.
 *
 * Enquanto a HEIC ia crua pro modelo, ela era impedimento: 22 das 69 peças não
 * podiam ser geradas, e a tela só sabia avisar. Agora a conversão roda no
 * caminho da geração (`campaign-image.service`), então HEIC virou uma NOTA — a
 * peça sai, e o operador fica sabendo que aquela foto passou por conversão. O
 * que ainda impede é foto que o servidor não entrega: dela não sai peça nenhuma.
 * ============================================================================ */

import { sequelize } from '../../config/database.js';
import { QueryTypes } from 'sequelize';
import { lerCabeca } from './campaign-image.service.js';
import { modoDaPeca, nomeDoArquivo } from './campaign-piece.service.js';

/** Concorrência modesta: são dezenas de fotos e o S3 não é o gargalo do dia. */
const emLotes = async (itens, n, fn) => {
  const saida = [];
  for (let i = 0; i < itens.length; i += n) {
    // eslint-disable-next-line no-await-in-loop
    saida.push(...(await Promise.all(itens.slice(i, i + n).map(fn))));
  }
  return saida;
};

const PORQUE_DO_MODO = {
  two: 'as fotos vão soltas no request, que é onde o modelo mantém a âncora da cena',
  collage: '3+ fotos soltas quebram o lettering, então elas viram uma tira de referência',
};

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

    const converter = fotos.filter((f) => f.precisaConverter);
    const quebradas = fotos.filter((f) => f.erro);
    // O Content-Type mentiu quando ele diz jpeg e os bytes dizem outra coisa.
    const mentiram = fotos.filter(
      (f) => f.formato && f.contentType && !f.contentType.includes(f.formato),
    );
    // Formato que não é JPEG nem HEIC não tem conversor aqui, e a peça morre na
    // geração. Isso IMPEDE, ao contrário da HEIC.
    const semConversor = fotos.filter(
      (f) => f.precisaConverter && f.formato !== 'heic' && !f.erro,
    );

    const modo = modoDaPeca(fotos.length);
    const impede = quebradas.length > 0 || semConversor.length > 0;

    return {
      telefone: t.cell_phone,
      arquivo: nomeDoArquivo({ telefone: t.cell_phone }),
      pets: pets.map((p) => p.nome),
      modo,
      imagensNoRequest: modo === 'collage' ? 2 : fotos.length + 1,
      porque: PORQUE_DO_MODO[modo],
      fotos,
      alertas: [
        // 🚨 NOTA, não impedimento. A conversão acontece antes de a foto chegar
        // no modelo, e o convertido fica guardado no S3. Ela continua sendo dita
        // em voz alta porque HEIC servida como jpeg é exatamente o caso em que o
        // modelo falha em SILÊNCIO se alguém tirar a conversão do caminho.
        ...(converter.filter((f) => f.formato === 'heic').length
          ? [
              {
                tipo: 'heic',
                grave: false,
                texto: `${converter.filter((f) => f.formato === 'heic').length} foto(s) em HEIC. São convertidas pra JPEG antes de gerar.`,
              },
            ]
          : []),
        ...(semConversor.length
          ? [
              {
                tipo: 'sem_conversor',
                grave: true,
                texto: `${semConversor.length} foto(s) em ${[
                  ...new Set(semConversor.map((f) => f.formato)),
                ].join(', ')}, que não temos como converter.`,
              },
            ]
          : []),
        // 🚨 Só quando NÃO há HEIC. Um HEIC servido como jpeg já É um
        // Content-Type que mente, e as duas linhas juntas contam o mesmo fato
        // duas vezes — o operador lê dois problemas onde existe um. Fora do
        // caso HEIC a divergência ainda vale ser dita: é sinal de upload
        // estranho, mas não impede a peça.
        ...(mentiram.length && !converter.length
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
      pronta: !impede,
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
    // peças gravam no mesmo lugar e uma casa recebe a arte da outra. Desde
    // 27/08 quem tem a última palavra é o índice único do banco, e esta conta
    // ficou pra dizer o problema ANTES do INSERT ser recusado.
    nomesUnicos: new Set(linhas.map((l) => l.arquivo)).size === linhas.length,
    linhas,
  };
};

export default { conferenciaPreVoo };
