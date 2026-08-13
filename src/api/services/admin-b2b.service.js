// admin-b2b.service.js
// Leitura da operação B2B: com quem a Latta falou, por qual categoria, o que
// deu, e o que ficou guardado sobre cada estabelecimento.
//
// 🚨 NENHUMA TABELA NOVA, de propósito. `scheduling_sessions` já é a tabela de
// ACIONAMENTO, não só de agendamento: o CHECK de `category` em prod aceita as
// oito categorias (veterinaria, petshop, banho_tosa, hotel, adestramento,
// dog_walker, funeraria, farmacia) e o de `purpose` aceita agendamento,
// pergunta e pedido. `clinics.category` tem o mesmo CHECK de oito. Ambos
// vieram da migration 20260515110000_scheduling_b2b_foundations.sql, que é
// explicitamente aditiva. Criar tabela paralela aqui seria duplicar um
// desenho que já existe e dividir a verdade em dois lugares.
//
// O que ESTÁ faltando não é schema, é escrita (medido em 13/08/2026):
//   - nenhuma EF escreve `purpose`; as 8 linhas estão no DEFAULT 'agendamento'
//   - a busca local (as 8 categorias no chat-engine) guarda estado só no Redis
//     com TTL de 5min e não grava acionamento nenhum
// Por isso esta tela nasce com sete categorias zeradas. Elas aparecem MESMO
// ASSIM, nomeadas e em zero: categoria que some da tela vira categoria que
// ninguém lembra de ligar.

import { pgQuery } from '../../config/postgres.js';

// Rótulos PT-BR das oito categorias do CHECK em prod. Existe porque a tela
// precisa desenhar a categoria que ainda NÃO aconteceu, e um GROUP BY só
// devolve o que existe.
//
// 🚨 Isto é um dicionário de RÓTULO, não a lista de categorias válidas. Uma
// lista escrita à mão envelhece calada: no dia em que o CHECK ganhar uma nona
// categoria, ela ficaria curta e a tela esconderia justamente a novidade. Não
// dá pra derivar o CHECK aqui (os testes do backend são herméticos, sem
// Postgres), então o desenho se protege por outro caminho:
// `mergeCategories()` UNE este dicionário com as categorias que de fato
// aparecem no banco. Categoria nova entra na tela sozinha, sem rótulo bonito
// mas visível — que é infinitamente melhor que sumir.
export const B2B_CATEGORY_LABELS = [
  { id: 'veterinaria', label: 'Veterinária' },
  { id: 'banho_tosa', label: 'Banho & tosa' },
  { id: 'petshop', label: 'Petshop' },
  { id: 'hotel', label: 'Hotel & creche' },
  { id: 'adestramento', label: 'Adestramento' },
  { id: 'dog_walker', label: 'Dog walker' },
  { id: 'farmacia', label: 'Farmácia' },
  { id: 'funeraria', label: 'Funerária pet' },
];

export const B2B_PURPOSES = [
  { id: 'agendamento', label: 'Agendamento' },
  { id: 'pergunta', label: 'Tirar dúvida' },
  { id: 'pedido', label: 'Pedido' },
];

/**
 * Une o dicionário de rótulos com as categorias observadas no banco.
 *
 * Categoria conhecida sai com rótulo PT-BR; categoria que apareceu no dado sem
 * estar no dicionário sai com o próprio id como rótulo e `unlabeled: true`,
 * pra tela poder sinalizar "isto é novo, ninguém traduziu ainda". Nenhuma das
 * duas some.
 */
export const mergeCategories = (observed = []) => {
  const known = new Map(B2B_CATEGORY_LABELS.map((c) => [c.id, { ...c, unlabeled: false }]));
  for (const id of observed) {
    const key = String(id || '').trim();
    if (!key || known.has(key)) continue;
    known.set(key, { id: key, label: key, unlabeled: true });
  }
  return [...known.values()];
};

// Estados que contam como desfecho positivo. `NO_SHOW` fica de fora de
// propósito: fechou e não aconteceu não é fechado.
const CLOSED_STATES = "('CONFIRMED','COMPLETED')";

const clampDays = (raw, fallback = 90) => {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 1) return fallback;
  return Math.min(Math.max(Math.round(n), 1), 730);
};

const TEST_PHONE_PREFIX = '5500000000';
const testFilter = (includeTest) =>
  includeTest ? '' : `AND coalesce(s.user_phone,'') NOT LIKE '${TEST_PHONE_PREFIX}%'`;

/**
 * Por categoria e propósito, com as oito sempre presentes.
 *
 * O volume real é pequeno (8 sessões no total em 13/08/2026), então esta
 * agregação é contexto — quem responde "o que aconteceu" é a linha do tempo.
 */
export const getByCategory = async ({ days = 90, includeTest = false } = {}) => {
  const d = clampDays(days);
  const { rows } = await pgQuery(
    `
    SELECT s.category,
           s.purpose,
           count(*) AS acionamentos,
           count(*) FILTER (WHERE s.state IN ${CLOSED_STATES}) AS fechados,
           count(*) FILTER (WHERE s.state = 'ESCALATED') AS escalados,
           count(*) FILTER (WHERE s.state LIKE 'CANCELLED%') AS cancelados,
           count(DISTINCT s.clinic_id) AS estabelecimentos,
           count(DISTINCT s.pet_owner_id) AS tutores,
           count(*) FILTER (WHERE s.quoted_price_text IS NOT NULL) AS com_valor_citado,
           avg(s.rating) FILTER (WHERE s.rating IS NOT NULL) AS nota_media,
           max(s.created_at) AS ultimo_em
      FROM scheduling_sessions s
     WHERE s.created_at >= now() - ($1 || ' days')::interval
       ${testFilter(includeTest)}
     GROUP BY 1, 2
    `,
    [String(d)],
  );
  return rows;
};

/**
 * A linha do tempo: um acionamento por linha, legível.
 *
 * Com o volume de hoje esta é a visão PRINCIPAL. Média de 8 casos não
 * descreve nada; o caso descreve.
 */
export const getTimeline = async ({ days = 90, includeTest = false, limit = 200 } = {}) => {
  const d = clampDays(days);
  const { rows } = await pgQuery(
    `
    SELECT s.id,
           s.created_at,
           s.category,
           s.purpose,
           s.state,
           s.source,
           s.service_requested,
           s.scheduled_date,
           s.confirmed_at,
           s.previous_scheduled_date,
           s.quoted_price_text,
           s.order_summary,
           s.rating,
           s.turns_count,
           s.escalation_reason,
           s.requires_deposit,
           s.deposit_amount,
           s.attendance_confirmed_at,
           s.clinic_id,
           c.name AS estabelecimento,
           c.city AS estabelecimento_cidade,
           c.neighbourhood AS estabelecimento_bairro,
           o.name AS tutor,
           p.name AS pet
      FROM scheduling_sessions s
      LEFT JOIN clinics c ON c.id = s.clinic_id
      LEFT JOIN pet_owners o ON o.id = s.pet_owner_id
      LEFT JOIN pets p ON p.id = s.pet_id
     WHERE s.created_at >= now() - ($1 || ' days')::interval
       ${testFilter(includeTest)}
     ORDER BY s.created_at DESC
     LIMIT $2
    `,
    [String(d), Math.min(Math.max(Number(limit) || 200, 1), 500)],
  );
  return rows;
};

/**
 * Agenda consolidada: o que está marcado daqui pra frente, mais o passado
 * recente.
 *
 * Só entra sessão com `scheduled_date`. Sessão escalada sem data não é
 * compromisso e não pode ocupar linha de agenda.
 */
export const getAgenda = async ({ includeTest = false, pastDays = 30 } = {}) => {
  const { rows } = await pgQuery(
    `
    SELECT s.id,
           s.scheduled_date,
           s.scheduled_service,
           s.service_requested,
           s.category,
           s.state,
           s.confirmed_at,
           s.attendance_confirmed_at,
           s.quoted_price_text,
           c.name AS estabelecimento,
           c.city AS estabelecimento_cidade,
           o.name AS tutor,
           o.cell_phone AS tutor_telefone,
           p.name AS pet
      FROM scheduling_sessions s
      LEFT JOIN clinics c ON c.id = s.clinic_id
      LEFT JOIN pet_owners o ON o.id = s.pet_owner_id
      LEFT JOIN pets p ON p.id = s.pet_id
     WHERE s.scheduled_date IS NOT NULL
       AND s.scheduled_date >= now() - ($1 || ' days')::interval
       AND s.state NOT LIKE 'CANCELLED%'
       ${testFilter(includeTest)}
     ORDER BY s.scheduled_date
     LIMIT 300
    `,
    [String(clampDays(pastDays, 30))],
  );
  return rows;
};

/**
 * Ficha do estabelecimento — o que já está guardado e ninguém vê.
 *
 * 🚨 `scheduling_total_attempts` e `scheduling_total_successful` são contadores
 * da própria `clinics` e NÃO batem com `scheduling_sessions`: em 13/08/2026 a
 * soma dava 123 tentativas e 46 sucessos contra 8 sessões existentes. Medindo
 * linha a linha, **118 das 123 são de "Iris Clinica Teste"**, a clínica de QA:
 * o contador nunca foi zerado depois dos testes. Ou seja, não é outra métrica,
 * é a mesma métrica contaminada. Viajam com nome próprio (`contador_legado_*`)
 * e a tela os rotula como legado. Nunca somar com o que sai de
 * `scheduling_sessions`, e nunca usar como denominador.
 */
export const getMerchants = async ({ days = 90, includeTest = false } = {}) => {
  const d = clampDays(days);
  const { rows } = await pgQuery(
    `
    WITH sess AS (
      SELECT s.clinic_id,
             count(*) AS acionamentos,
             count(*) FILTER (WHERE s.state IN ${CLOSED_STATES}) AS fechados,
             count(*) FILTER (WHERE s.state = 'ESCALATED') AS escalados,
             avg(s.rating) FILTER (WHERE s.rating IS NOT NULL) AS nota_media_latta,
             max(s.created_at) AS ultimo_acionamento
        FROM scheduling_sessions s
       WHERE s.created_at >= now() - ($1 || ' days')::interval
         ${testFilter(includeTest)}
       GROUP BY 1
    )
    SELECT c.id,
           c.name,
           c.category,
           c.city,
           c.neighbourhood,
           c.phone_normalized,
           c.whatsapp_verified,
           c.whatsapp_invalid,
           c.do_not_contact,
           c.requires_deposit,
           c.quality_score,
           c.rating AS nota_google,
           c.number_comments AS comentarios_google,
           c.opening_hours,
           c.last_contacted_at,
           c.scheduling_total_attempts AS contador_legado_tentativas,
           c.scheduling_total_successful AS contador_legado_sucessos,
           coalesce(sess.acionamentos, 0) AS acionamentos,
           coalesce(sess.fechados, 0) AS fechados,
           coalesce(sess.escalados, 0) AS escalados,
           sess.nota_media_latta,
           sess.ultimo_acionamento
      FROM clinics c
      LEFT JOIN sess ON sess.clinic_id = c.id
     WHERE sess.clinic_id IS NOT NULL
        OR c.last_contacted_at IS NOT NULL
        OR c.scheduling_total_attempts > 0
     ORDER BY sess.ultimo_acionamento DESC NULLS LAST,
              c.last_contacted_at DESC NULLS LAST
     LIMIT 200
    `,
    [String(d)],
  );
  return rows;
};

/**
 * Cobertura do cadastro por categoria — quantos estabelecimentos existem pra
 * cada uma, e quantos dá pra acionar de fato.
 *
 * É o que explica uma categoria zerada na tela: farmácia não tem acionamento
 * porque não tem cadastro nenhum, não porque ninguém quis.
 */
export const getCoverage = async () => {
  const { rows } = await pgQuery(
    `
    SELECT c.category,
           count(*) AS cadastrados,
           count(*) FILTER (WHERE c.whatsapp_verified) AS com_whatsapp,
           count(*) FILTER (WHERE c.do_not_contact) AS nao_contatar,
           count(*) FILTER (WHERE c.last_contacted_at IS NOT NULL) AS ja_contatados
      FROM clinics c
     GROUP BY 1
    `,
  );
  return rows;
};

export default {
  B2B_CATEGORY_LABELS,
  B2B_PURPOSES,
  mergeCategories,
  getByCategory,
  getTimeline,
  getAgenda,
  getMerchants,
  getCoverage,
};
