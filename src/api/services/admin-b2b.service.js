// admin-b2b.service.js
// Leitura da operação B2B: com quem a Latta falou, por qual categoria, o que
// deu, e o que ficou guardado sobre cada estabelecimento.
//
// 🚨 NENHUMA TABELA NOVA, de propósito. `scheduling_sessions` já é a tabela de
// ACIONAMENTO, não só de agendamento: o CHECK de `category` em prod aceita as
// oito categorias (veterinaria, petshop, banho_tosa, hotel, adestramento,
// dog_walker, funeraria, farmacia) e o de `purpose` aceita agendamento,
// pergunta e pedido. `clinics.category` tem o mesmo CHECK. Ambos vieram da
// migration 20260515110000_scheduling_b2b_foundations.sql, que é aditiva.
//
// VOCABULÁRIO, porque os dois se confundem na tela e o operador precisa da
// diferença:
//   ACIONAMENTO = a Latta abriu conversa com um estabelecimento em nome de um
//                 tutor. É uma linha em `scheduling_sessions`. Toda linha é um
//                 acionamento, tenha dado em algo ou não.
//   AGENDAMENTO = o acionamento virou compromisso com data marcada
//                 (`scheduled_date` preenchido e não cancelado).
// Por isso a tela mostra X/Y, nunca só um número: 8 acionamentos com 3
// agendamentos é uma operação; 8 com 8 é outra.
//
// O que NÃO está gravado, e a tela declara em vez de esconder: nenhuma EF
// escreve `purpose` (tudo entra no DEFAULT 'agendamento'), e a busca local das
// oito categorias guarda estado só no Redis por 5min, sem gravar acionamento.

import { pgQuery } from '../../config/postgres.js';
import { excludeSynthetic, isWhitelistedQa } from './qa-filter.js';

// Rótulos PT-BR das oito categorias do CHECK em prod. É dicionário de RÓTULO,
// não a lista de categorias válidas: `mergeCategories` une com o que o banco
// devolveu, então categoria nova aparece na tela mesmo sem tradução.
export const B2B_CATEGORY_LABELS = [
  { id: 'veterinaria', label: 'Veterinária' },
  { id: 'banho_tosa', label: 'Banho & tosa' },
  { id: 'petshop', label: 'Petshop' },
  { id: 'hotel', label: 'Hotel & creche' },
  { id: 'adestramento', label: 'Adestramento' },
  // "Passeador", não "Dog walker": o painel é operado em PT-BR e o termo em
  // inglês era o único estrangeirismo da lista.
  { id: 'dog_walker', label: 'Passeador' },
  { id: 'farmacia', label: 'Farmácia' },
  { id: 'funeraria', label: 'Funerária pet' },
];

export const B2B_PURPOSES = [
  { id: 'agendamento', label: 'Agendamento' },
  { id: 'pergunta', label: 'Tirar dúvida' },
  { id: 'pedido', label: 'Pedido' },
];

export const mergeCategories = (observed = []) => {
  const known = new Map(B2B_CATEGORY_LABELS.map((c) => [c.id, { ...c, unlabeled: false }]));
  for (const id of observed) {
    const key = String(id || '').trim();
    if (!key || known.has(key)) continue;
    known.set(key, { id: key, label: key, unlabeled: true });
  }
  return [...known.values()];
};

// Desfecho positivo. `NO_SHOW` fica de fora: fechou e não aconteceu não fechou.
const CLOSED_STATES = "('CONFIRMED','COMPLETED')";
// Um acionamento vira AGENDAMENTO quando tem data marcada e não foi cancelado.
const IS_SCHEDULED = `(s.scheduled_date IS NOT NULL AND s.state NOT LIKE 'CANCELLED%')`;

const NO_SYNTHETIC = excludeSynthetic('s.user_phone');
const QA_FLAG = isWhitelistedQa('s.user_phone');

const clampDays = (raw, fallback = 30) => {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 1) return fallback;
  return Math.min(Math.max(Math.round(n), 1), 730);
};

/** Acionamentos e agendamentos por categoria e propósito. */
export const getByCategory = async ({ days = 30 } = {}) => {
  const { rows } = await pgQuery(
    `
    SELECT s.category,
           s.purpose,
           count(*) AS acionamentos,
           count(*) FILTER (WHERE ${IS_SCHEDULED}) AS agendamentos,
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
       ${NO_SYNTHETIC}
     GROUP BY 1, 2
    `,
    [String(clampDays(days))],
  );
  return rows;
};

/**
 * Quanto tempo a jornada levou, e de quem era a vez em cada trecho.
 *
 * A fonte é `state_history`: um array `{at, state, reason}` que toda sessão
 * carrega. Entre dois eventos consecutivos existe um TRECHO, e o estado do
 * primeiro diz de quem era a vez naquele intervalo:
 *
 *   CONTACTING, NEGOTIATING              → estabelecimento (esperamos ele)
 *   WAITING_USER, WAITING_FINAL_CONFIRM  → tutor (esperamos o tutor)
 *   ESCALATED                            → suporte (um humano assumiu)
 *   INITIATED                            → Latta (ainda não saímos daqui)
 *
 * `INITIATED` não é detalhe: numa das jornadas medidas ele responde por 35 das
 * 36 horas — o acionamento entrou fora do expediente e dormiu na fila. Sem
 * esse balde, as partes não somam o total e a conta parece mentir.
 *
 * DUAS REGRAS que a conta precisa respeitar pra não mentir:
 *
 * 1. A jornada acaba no PRIMEIRO desfecho, não no último evento. Sessão que é
 *    confirmada e escala depois (relay, bot loop) continua recebendo eventos
 *    por dias; contá-los diria "essa jornada levou 13 dias" sobre um
 *    agendamento fechado em 9 segundos.
 * 2. Por isso todo trecho é fechado no MENOR entre o próximo evento e o
 *    desfecho. Sem isso as partes ficariam maiores que o total.
 *
 * Jornada ainda aberta não entra na média (não tem duração ainda), mas os
 * trechos dela contam: é assim que "está com o suporte há 13 dias" aparece.
 */
const JORNADA_CTE = (noSynthetic) => `
  sess_j AS (
    SELECT s.id, s.pet_owner_id, s.created_at, s.state_history
      FROM scheduling_sessions s
     WHERE s.created_at >= now() - ($1 || ' days')::interval
       ${noSynthetic}
  ), eventos AS (
    SELECT sess_j.id,
           e.ord,
           (e.evt->>'at')::timestamptz AS at,
           e.evt->>'state' AS st
      FROM sess_j
      CROSS JOIN LATERAL jsonb_array_elements(coalesce(sess_j.state_history, '[]'::jsonb))
        WITH ORDINALITY AS e(evt, ord)
  ), fim AS (
    SELECT id, min(at) AS terminou
      FROM eventos
     WHERE st IN ('CONFIRMED','COMPLETED','CANCELLED_BY_USER','CANCELLED_BY_MERCHANT','NO_SHOW','FAILED')
     GROUP BY 1
  ), trechos AS (
    SELECT e.id, e.st, e.at,
           lead(e.at) OVER (PARTITION BY e.id ORDER BY e.ord) AS proximo,
           f.terminou
      FROM eventos e
      LEFT JOIN fim f ON f.id = e.id
  ), balde AS (
    SELECT id,
           CASE
             WHEN st IN ('CONTACTING', 'NEGOTIATING')             THEN 'estabelecimento'
             WHEN st IN ('WAITING_USER', 'WAITING_FINAL_CONFIRM') THEN 'tutor'
             WHEN st = 'ESCALATED'                                THEN 'suporte'
             WHEN st = 'INITIATED'                                THEN 'latta'
             ELSE NULL
           END AS quem,
           greatest(
             EXTRACT(EPOCH FROM (
               least(coalesce(proximo, now()), coalesce(terminou, now())) - at
             )), 0
           ) AS seg
      FROM trechos
     WHERE terminou IS NULL OR at < terminou
  ), por_sessao AS (
    SELECT id,
           sum(seg) FILTER (WHERE quem = 'tutor')           AS seg_tutor,
           sum(seg) FILTER (WHERE quem = 'estabelecimento') AS seg_estabelecimento,
           sum(seg) FILTER (WHERE quem = 'suporte')         AS seg_suporte,
           sum(seg) FILTER (WHERE quem = 'latta')           AS seg_latta
      FROM balde
     GROUP BY 1
  ), jornada AS (
    SELECT sess_j.pet_owner_id,
           EXTRACT(EPOCH FROM (coalesce(f.terminou, now()) - sess_j.created_at)) AS total_seg,
           f.terminou IS NOT NULL AS fechada,
           p.seg_tutor, p.seg_estabelecimento, p.seg_suporte, p.seg_latta
      FROM sess_j
      LEFT JOIN fim f ON f.id = sess_j.id
      LEFT JOIN por_sessao p ON p.id = sess_j.id
  ), jornada_por_tutor AS (
    SELECT pet_owner_id,
           count(*) FILTER (WHERE fechada)                       AS jornadas_fechadas,
           round(avg(total_seg) FILTER (WHERE fechada))          AS jornada_media_seg,
           round(min(total_seg) FILTER (WHERE fechada))          AS jornada_min_seg,
           round(max(total_seg) FILTER (WHERE fechada))          AS jornada_max_seg,
           round(sum(coalesce(seg_tutor, 0)))                    AS seg_tutor,
           round(sum(coalesce(seg_estabelecimento, 0)))          AS seg_estabelecimento,
           round(sum(coalesce(seg_suporte, 0)))                  AS seg_suporte,
           round(sum(coalesce(seg_latta, 0)))                    AS seg_latta
      FROM jornada
     GROUP BY 1
  )
`;

/**
 * Quem mais aciona, o que pede, e quanto tempo a jornada dele leva.
 *
 * `servicos` é a lista real do que aquele tutor pediu, agregada — é a resposta
 * pra "o que ele agenda", que nenhum número sozinho dá. Vem de
 * `service_requested`, que é o texto que o intake capturou.
 *
 * As colunas de tempo vêm de `JORNADA_CTE` (ver o bloco acima).
 */
export const getTutors = async ({ days = 30 } = {}) => {
  const { rows } = await pgQuery(
    `
    WITH ${JORNADA_CTE(NO_SYNTHETIC)}
    SELECT s.pet_owner_id,
           o.name AS tutor,
           o.cell_phone,
           ${QA_FLAG} AS qa_whitelist,
           count(*) AS acionamentos,
           count(*) FILTER (WHERE ${IS_SCHEDULED}) AS agendamentos,
           count(*) FILTER (WHERE s.state IN ${CLOSED_STATES}) AS fechados,
           count(DISTINCT s.clinic_id) AS estabelecimentos,
           count(DISTINCT s.category) AS categorias,
           string_agg(DISTINCT s.category, ',') AS categorias_lista,
           string_agg(DISTINCT nullif(trim(s.service_requested), ''), ' · ') AS servicos,
           avg(s.rating) FILTER (WHERE s.rating IS NOT NULL) AS nota_media,
           max(s.created_at) AS ultimo_em,
           max(j.jornadas_fechadas)   AS jornadas_fechadas,
           max(j.jornada_media_seg)   AS jornada_media_seg,
           max(j.jornada_min_seg)     AS jornada_min_seg,
           max(j.jornada_max_seg)     AS jornada_max_seg,
           max(j.seg_tutor)           AS seg_tutor,
           max(j.seg_estabelecimento) AS seg_estabelecimento,
           max(j.seg_suporte)         AS seg_suporte,
           max(j.seg_latta)           AS seg_latta
      FROM scheduling_sessions s
      LEFT JOIN pet_owners o ON o.id = s.pet_owner_id
      -- jornada_por_tutor já vem com UMA linha por tutor, então o max() aqui
      -- é só o agregado exigido pelo GROUP BY: não escolhe nada.
      -- (Sem crase neste bloco: a query é template literal e a crase a fecha.)
      LEFT JOIN jornada_por_tutor j ON j.pet_owner_id = s.pet_owner_id
     WHERE s.created_at >= now() - ($1 || ' days')::interval
       ${NO_SYNTHETIC}
     GROUP BY 1, 2, 3, 4
     ORDER BY acionamentos DESC, agendamentos DESC
     LIMIT 100
    `,
    [String(clampDays(days))],
  );
  return rows;
};

/**
 * A linha do tempo: um acionamento por linha.
 *
 * Carrega `pet_owner_id` e `cell_phone` porque a tela precisa levar o operador
 * pra CONVERSA daquele tutor — ver o acionamento sem poder ler o que foi dito
 * deixa a análise pela metade.
 */
export const getTimeline = async ({ days = 30, limit = 300 } = {}) => {
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
           ${IS_SCHEDULED} AS agendado,
           ${QA_FLAG} AS qa_whitelist,
           s.clinic_id,
           c.name AS estabelecimento,
           c.city AS estabelecimento_cidade,
           c.neighbourhood AS estabelecimento_bairro,
           c.phone_normalized AS estabelecimento_telefone,
           s.pet_owner_id,
           o.name AS tutor,
           o.cell_phone AS tutor_telefone,
           p.name AS pet
      FROM scheduling_sessions s
      LEFT JOIN clinics c ON c.id = s.clinic_id
      LEFT JOIN pet_owners o ON o.id = s.pet_owner_id
      LEFT JOIN pets p ON p.id = s.pet_id
     WHERE s.created_at >= now() - ($1 || ' days')::interval
       ${NO_SYNTHETIC}
     ORDER BY s.created_at DESC
     LIMIT $2
    `,
    [String(clampDays(days)), Math.min(Math.max(Number(limit) || 300, 1), 500)],
  );
  return rows;
};

/**
 * Agenda pro calendário.
 *
 * A janela NÃO é a mesma do resto da tela: um calendário mensal precisa do mês
 * inteiro, inclusive o que já passou e o que ainda vai acontecer. Por isso
 * recebe `from`/`to` explícitos em vez de herdar o `days` dos outros painéis —
 * herdar faria o mês aparecer pela metade sem nada explicando.
 */
export const getAgenda = async ({ from, to } = {}) => {
  const { rows } = await pgQuery(
    `
    SELECT s.id,
           s.scheduled_date,
           s.scheduled_service,
           s.service_requested,
           s.category,
           s.state,
           s.purpose,
           s.confirmed_at,
           s.attendance_confirmed_at,
           s.quoted_price_text,
           s.order_summary,
           s.rating,
           s.escalation_reason,
           s.requires_deposit,
           ${QA_FLAG} AS qa_whitelist,
           s.clinic_id,
           c.name AS estabelecimento,
           c.city AS estabelecimento_cidade,
           c.neighbourhood AS estabelecimento_bairro,
           c.phone_normalized AS estabelecimento_telefone,
           c.requires_deposit AS estabelecimento_exige_sinal,
           c.rating AS estabelecimento_nota_google,
           s.pet_owner_id,
           o.name AS tutor,
           o.cell_phone AS tutor_telefone,
           p.name AS pet
      FROM scheduling_sessions s
      LEFT JOIN clinics c ON c.id = s.clinic_id
      LEFT JOIN pet_owners o ON o.id = s.pet_owner_id
      LEFT JOIN pets p ON p.id = s.pet_id
     WHERE s.scheduled_date IS NOT NULL
       AND s.scheduled_date >= $1::date
       AND s.scheduled_date < ($2::date + 1)
       ${NO_SYNTHETIC}
     ORDER BY s.scheduled_date
     LIMIT 500
    `,
    [from, to],
  );
  return rows;
};

/**
 * Ficha do estabelecimento — só quem a Latta CONTATOU de verdade.
 *
 * 🚨 O critério é ter acionamento na janela OU `last_contacted_at`. O
 * `scheduling_total_attempts > 0` saiu da condição: ele é contador legado da
 * própria `clinics` e trazia pra tela a clínica de QA, que sozinha responde por
 * 118 das 123 tentativas somadas. Cadastro que nunca foi contatado é base, não
 * relacionamento, e enche a tela de linha morta.
 *
 * Os contadores legados continuam viajando com nome próprio
 * (`contador_legado_*`) e a tela os rotula como tal — nunca somam com o que sai
 * de `scheduling_sessions`, nem entram em denominador.
 */
export const getMerchants = async ({ days = 30 } = {}) => {
  const { rows } = await pgQuery(
    `
    WITH sess AS (
      SELECT s.clinic_id,
             count(*) AS acionamentos,
             count(*) FILTER (WHERE ${IS_SCHEDULED}) AS agendamentos,
             count(*) FILTER (WHERE s.state IN ${CLOSED_STATES}) AS fechados,
             count(*) FILTER (WHERE s.state = 'ESCALATED') AS escalados,
             avg(s.rating) FILTER (WHERE s.rating IS NOT NULL) AS nota_media_latta,
             max(s.created_at) AS ultimo_acionamento,
             string_agg(DISTINCT nullif(trim(s.service_requested), ''), ' · ') AS servicos
        FROM scheduling_sessions s
       WHERE s.created_at >= now() - ($1 || ' days')::interval
         ${NO_SYNTHETIC}
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
           coalesce(sess.agendamentos, 0) AS agendamentos,
           coalesce(sess.fechados, 0) AS fechados,
           coalesce(sess.escalados, 0) AS escalados,
           sess.servicos,
           sess.nota_media_latta,
           sess.ultimo_acionamento
      FROM clinics c
      LEFT JOIN sess ON sess.clinic_id = c.id
     WHERE (sess.clinic_id IS NOT NULL OR c.last_contacted_at IS NOT NULL)
       ${excludeSynthetic('c.phone_normalized')}
       AND NOT ${isWhitelistedQa('c.phone_normalized')}
     ORDER BY sess.ultimo_acionamento DESC NULLS LAST,
              c.last_contacted_at DESC NULLS LAST
     LIMIT 200
    `,
    [String(clampDays(days))],
  );
  return rows;
};

/**
 * Cobertura do cadastro por categoria — é o que explica uma categoria zerada:
 * farmácia não tem acionamento porque não tem cadastro, não porque ninguém quis.
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
     WHERE true
       ${excludeSynthetic('c.phone_normalized')}
       AND NOT ${isWhitelistedQa('c.phone_normalized')}
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
  getTutors,
  getTimeline,
  getAgenda,
  getMerchants,
  getCoverage,
};
