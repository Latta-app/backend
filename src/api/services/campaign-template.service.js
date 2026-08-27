/* ============================================================================
 * O TEMPLATE DA CAMPANHA — as variáveis resolvidas casa por casa
 * ============================================================================
 *
 * A peça é a arte. O template é o TEXTO que chega junto dela, e ele é onde a
 * mensagem fala com o tutor: chama o pet pelo nome, e chama pelo gênero certo.
 *
 * 🚨 O GÊNERO SAI DE `pet_genders.name`, E NUNCA DO NOME DO PET.
 *
 * Não é preferência de implementação, é a única forma correta. "Luna" pode ser
 * macho, "Mel" pode ser macho, e uma heurística de terminação acerta a maioria e
 * erra numa mensagem que chama o cachorro de alguém pelo pronome errado — numa
 * peça que a pessoa recebeu justamente porque é sobre o animal dela. Quando o
 * gênero não está cadastrado, esta camada BLOQUEIA a casa e diz qual pet falta,
 * em vez de chutar.
 *
 * 🚨 E NÃO HÁ DERIVAÇÃO DE PLURAL. Em português "cachorro" vira "cachorros" mas
 * "cão" vira "cães", e um grupo misto leva masculino plural. Quem escreve as
 * quatro formas é o operador, que sabe o que quis dizer; o que esta camada faz é
 * dizer QUAIS formas o público realmente exige, pra ninguém preencher campo à
 * toa nem descobrir a forma que faltava depois do disparo.
 * ============================================================================ */

import { sequelize } from '../../config/database.js';
import { QueryTypes } from 'sequelize';

/**
 * As fontes possíveis de uma variável `{{n}}`.
 *
 * Deliberadamente poucas. Cada fonte a mais é um jeito a mais de a mensagem sair
 * diferente do que o operador leu na prévia.
 */
export const FONTES = ['tutor', 'tutor_completo', 'pets', 'genero', 'fixo'];

/**
 * O gênero da CASA, a partir dos pets.
 *
 * Regra do português: grupo misto leva masculino plural. Só um grupo inteiramente
 * de fêmeas leva feminino plural.
 *
 * 🚨 Pet sem gênero cadastrado não vira masculino por omissão. Ele devolve
 * `falta`, e quem chamou trata a casa como bloqueada. Masculino por omissão é
 * exatamente a inferência que esta função existe pra impedir: ela seria invisível
 * na prévia (o texto sai plausível) e visível pro tutor.
 */
export const generoDaCasa = (pets) => {
  const lista = Array.isArray(pets) ? pets : [];
  if (!lista.length) return { falta: ['a casa não tem pet no público congelado'] };

  const semGenero = lista.filter((p) => !p.genero).map((p) => p.nome || 'sem nome');
  if (semGenero.length) return { falta: semGenero };

  return {
    plural: lista.length > 1,
    // Misto é masculino plural. Feminino só quando TODAS são fêmeas.
    feminino: lista.every((p) => p.genero === 'Female'),
  };
};

/** A forma que a casa exige: m, f, mp ou fp. */
export const formaDaCasa = (genero) => {
  if (genero.falta) return null;
  if (!genero.plural) return genero.feminino ? 'f' : 'm';
  return genero.feminino ? 'fp' : 'mp';
};

const ROTULO_DA_FORMA = {
  m: 'um pet macho',
  f: 'uma pet fêmea',
  mp: 'vários pets, com ao menos um macho',
  fp: 'várias pets, todas fêmeas',
};

/**
 * Junta nomes como gente escreve: "Bilbo", "Bilbo e Vamp",
 * "Noé, Caçula e Manu".
 *
 * Vírgula em tudo ("Noé, Caçula, Manu") sai de sistema, e a mensagem inteira
 * existe pra não soar como sistema.
 */
export const juntarNomes = (nomes) => {
  const limpos = nomes.map((n) => String(n || '').trim()).filter(Boolean);
  if (limpos.length <= 1) return limpos[0] || '';
  return `${limpos.slice(0, -1).join(', ')} e ${limpos[limpos.length - 1]}`;
};

/**
 * O primeiro nome do tutor.
 *
 * 🚨 Corta no espaço e mais nada. Não passa por régua de nome de gente, não tira
 * dígito e não conserta caixa: o nome já chega limpo do banco, e nome de negócio
 * ("Studio Cicarello 3D") é nome legítimo de tutor.
 */
export const primeiroNome = (nome) => String(nome || '').trim().split(/\s+/)[0] || '';

/**
 * 🚨 A FORMA DE GÊNERO PODE CARREGAR OS NOMES DENTRO.
 *
 * O template que rodou no Dia do Cachorro pede exatamente isso num slot só:
 * "eu fiz uma homenagem {{1}}" vira "pro Bilbo", "pra Ursa", "pros Noé, Caçula e
 * Manu". O artigo concorda com o gênero E os nomes vêm junto — separar em duas
 * variáveis exigiria mudar o template aprovado na Meta, que é o que ninguém pode
 * fazer no meio de uma campanha.
 *
 * Duas marcações, e só duas: `{pets}` e `{tutor}`. Cada marcação a mais é um
 * jeito a mais de a mensagem sair diferente do que o operador leu na prévia.
 */
export const preencherMarcacoes = (texto, { pets, tutor }) =>
  String(texto).replace(/\{(pets|tutor)\}/g, (_, chave) => (chave === 'pets' ? pets : tutor));

const resolverVariavel = ({ config, tutor, genero }) => {
  const fonte = config?.fonte;
  const nomesDosPets = juntarNomes(tutor.pets.map((p) => p.nome));
  const primeiro = primeiroNome(tutor.nome);

  if (fonte === 'fixo') return { texto: String(config.texto ?? '') };
  if (fonte === 'tutor') return { texto: primeiro };
  if (fonte === 'tutor_completo') return { texto: String(tutor.nome || '').trim() };
  if (fonte === 'pets') return { texto: nomesDosPets };

  if (fonte === 'genero') {
    if (genero.falta) {
      return {
        texto: '',
        bloqueia: `sem gênero cadastrado: ${genero.falta.join(', ')}`,
      };
    }
    const forma = formaDaCasa(genero);
    const valor = String(config[forma] ?? '').trim();
    if (!valor) {
      return {
        texto: '',
        bloqueia: `falta a forma "${forma}" (${ROTULO_DA_FORMA[forma]})`,
      };
    }
    return { texto: preencherMarcacoes(valor, { pets: nomesDosPets, tutor: primeiro }) };
  }

  return { texto: '', bloqueia: `fonte "${fonte || 'nenhuma'}" não é conhecida` };
};

const aplicar = (corpo, valores) =>
  String(corpo || '').replace(/\{\{(\d+)\}\}/g, (inteiro, n) =>
    valores[n] === undefined ? inteiro : valores[n],
  );

/** As posições `{{n}}` que o corpo do template realmente usa. */
export const variaveisDoCorpo = (corpo) => [
  ...new Set([...String(corpo || '').matchAll(/\{\{(\d+)\}\}/g)].map((m) => m[1])),
];

/**
 * Resolve o template pro público congelado, casa por casa.
 *
 * Read-only e sem efeito: não manda nada. É a prévia do que 69 pessoas vão ler,
 * e ela existe porque uma variável errada só aparece depois do disparo.
 */
export const resolverTemplate = async (campaignId, { corpo, variaveis = {} }) => {
  // 🚨 DUAS ARMADILHAS DE SCHEMA NESTE JOIN, as duas medidas em 27/08.
  //
  // 1. A coluna de telefone da `contacts` é `cellphone`, SEM underscore. Em
  //    `pet_owners` e `chat_history` é `cell_phone`. O nome óbvio derruba a
  //    consulta inteira com `column c.cell_phone does not exist`.
  //
  // 2. Mesmo com o nome certo, juntar por TELEFONE é frágil: o telefone da
  //    `contacts` aparece em formatos que não batem byte a byte com os dígitos
  //    normalizados do público congelado. O `pet_owner_id` é uuid e é exato, e
  //    o público já carrega o dele. Junte por id.
  //
  // E `deleted_at IS NULL`: contato apagado não empresta nome pra mensagem
  // nova. O nome dele foi removido de propósito por alguém.
  const casas = await sequelize.query(
    `SELECT a.cell_phone,
            a.pets,
            COALESCE(NULLIF(o.name, ''), NULLIF(c.profile_name, '')) AS nome
       FROM campaign_audience a
       LEFT JOIN pet_owners o ON o.id = a.pet_owner_id
       LEFT JOIN contacts   c ON c.pet_owner_id = a.pet_owner_id
                             AND c.deleted_at IS NULL
      WHERE a.campaign_id = :id
      ORDER BY a.cell_phone`,
    { type: QueryTypes.SELECT, replacements: { id: campaignId } },
  );

  const posicoes = variaveisDoCorpo(corpo);

  const linhas = casas.map((casa) => {
    const tutor = {
      telefone: casa.cell_phone,
      nome: casa.nome,
      pets: Array.isArray(casa.pets) ? casa.pets : [],
    };
    const genero = generoDaCasa(tutor.pets);

    const valores = {};
    const bloqueios = [];
    for (const n of posicoes) {
      const r = resolverVariavel({ config: variaveis[n], tutor, genero });
      valores[n] = r.texto;
      if (r.bloqueia) bloqueios.push(`{{${n}}}: ${r.bloqueia}`);
      // 🚨 Variável vazia sem motivo declarado também bloqueia. Um `{{1}}` que
      // resolve pra string vazia manda "Oi , tudo bem?" pro tutor, e nada no
      // caminho reclama — o template é válido, o envio dá 200, e o defeito só
      // aparece na tela de quem recebeu.
      else if (!r.texto && variaveis[n]?.fonte !== 'fixo') {
        bloqueios.push(`{{${n}}}: resolveu vazio`);
      }
    }

    return {
      telefone: tutor.telefone,
      nome: tutor.nome,
      pets: tutor.pets.map((p) => p.nome),
      forma: formaDaCasa(genero),
      valores,
      texto: aplicar(corpo, valores),
      bloqueios,
      pronta: bloqueios.length === 0,
    };
  });

  // Quais formas de concordância o público REALMENTE exige. Sem isto o operador
  // preenche as quatro no escuro, ou descobre a que faltava depois do disparo.
  const formasExigidas = [...new Set(linhas.map((l) => l.forma).filter(Boolean))].map((f) => ({
    forma: f,
    rotulo: ROTULO_DA_FORMA[f],
    casas: linhas.filter((l) => l.forma === f).length,
  }));

  return {
    total: linhas.length,
    prontas: linhas.filter((l) => l.pronta).length,
    posicoes,
    formasExigidas,
    semGenero: linhas.filter((l) => !l.forma).length,
    linhas,
  };
};

export default { resolverTemplate, generoDaCasa, formaDaCasa, juntarNomes, primeiroNome };
