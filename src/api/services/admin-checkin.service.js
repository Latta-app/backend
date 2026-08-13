// admin-checkin.service.js
// Leitura agregada do ritual de check-in pra tela de admin.
//
// Fonte: `daily_checkins`, `streak_state`, `checkin_config`, `daily_missions`,
// `leaderboard_snapshots` e o funil de entrega em `proactive_nudges_log`.
// Tudo READ-ONLY — esta tela não escreve nada.
//
// Não há RPC nova: as consultas moram aqui, no mesmo padrão do
// clinic-activity-log.service.js. O `get_scheduling_metrics` existe porque a
// agregação dele já estava no banco; criar RPC pra isto aqui só espalharia a
// lógica por dois repositórios sem ganho.

import { pgQuery } from '../../config/postgres.js';

// Personas de teste vivem em 5500000000001..099 (DDI 55 + DDD 00 inválido).
// Elas fazem check-in igual a gente de verdade, e sem filtrar isso a tela
// mede o QA, não a base. O filtro é opt-out (`include_test=1`) pra quando o
// operador estiver justamente conferindo uma persona.
const TEST_PHONE_PREFIX = '5500000000';

const clampDays = (raw, fallback = 30) => {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 1) return fallback;
  return Math.min(Math.max(Math.round(n), 1), 365);
};

// Cláusula reaproveitada: mantém o filtro de persona idêntico em todas as
// consultas. Duas telas medindo denominadores diferentes é como um número
// certo vira conclusão errada.
const testFilter = (includeTest, alias = 'o') =>
  includeTest ? '' : `AND coalesce(${alias}.cell_phone,'') NOT LIKE '${TEST_PHONE_PREFIX}%'`;

/**
 * Faixa 1 — "está rodando?". Hoje, ontem, e o funil de entrega das últimas
 * 24h.
 *
 * O funil vem do `proactive_nudges_log` e é medido por `event='nudge_sent'`,
 * NUNCA por `tick_summary`: o tick escreve um resumo por rodada mesmo quando
 * não entrega nada, e contar resumo como entrega já inflou "1.956 cutucadas"
 * que eram 10 envios reais.
 */
export const getPulse = async ({ includeTest = false } = {}) => {
  const { rows } = await pgQuery(
    `
    SELECT
      (SELECT count(*) FROM daily_checkins d
         JOIN pet_owners o ON o.id = d.pet_owner_id
        WHERE d.checkin_date = CURRENT_DATE ${testFilter(includeTest)}) AS checkins_hoje,
      (SELECT count(DISTINCT d.pet_owner_id) FROM daily_checkins d
         JOIN pet_owners o ON o.id = d.pet_owner_id
        WHERE d.checkin_date = CURRENT_DATE ${testFilter(includeTest)}) AS tutores_hoje,
      (SELECT count(*) FROM daily_checkins d
         JOIN pet_owners o ON o.id = d.pet_owner_id
        WHERE d.checkin_date = CURRENT_DATE - 1 ${testFilter(includeTest)}) AS checkins_ontem,
      (SELECT count(*) FROM proactive_nudges_log
        WHERE event = 'nudge_sent' AND tick LIKE '%checkin%'
          AND created_at >= now() - interval '24 hours') AS convites_24h,
      (SELECT count(*) FROM proactive_nudges_log
        WHERE event = 'error' AND tick LIKE '%checkin%'
          AND created_at >= now() - interval '24 hours') AS erros_24h,
      (SELECT count(*) FROM proactive_nudges_log
        WHERE event = 'nudge_blocked' AND tick LIKE '%checkin%'
          AND created_at >= now() - interval '24 hours') AS bloqueios_24h,
      (SELECT max(created_at) FROM proactive_nudges_log
        WHERE tick LIKE '%checkin%') AS ultimo_tick_em
    `,
  );
  return rows[0] || {};
};

/** Faixa 1 — série diária pra dar contexto ao número de hoje. */
export const getDailySeries = async ({ days = 30, includeTest = false } = {}) => {
  const d = clampDays(days);
  const { rows } = await pgQuery(
    `
    WITH dias AS (
      SELECT generate_series(CURRENT_DATE - ($1::int - 1), CURRENT_DATE, '1 day')::date AS dia
    ),
    ck AS (
      SELECT d.checkin_date AS dia,
             count(*) AS checkins,
             count(DISTINCT d.pet_owner_id) AS tutores,
             count(*) FILTER (WHERE d.source = 'quick_reply') AS por_atalho
        FROM daily_checkins d
        JOIN pet_owners o ON o.id = d.pet_owner_id
       WHERE d.checkin_date >= CURRENT_DATE - ($1::int - 1) ${testFilter(includeTest)}
       GROUP BY 1
    ),
    envios AS (
      SELECT created_at::date AS dia, count(*) AS convites
        FROM proactive_nudges_log
       WHERE event = 'nudge_sent' AND tick LIKE '%checkin%'
         AND created_at >= CURRENT_DATE - ($1::int - 1)
       GROUP BY 1
    )
    SELECT dias.dia,
           coalesce(ck.checkins, 0) AS checkins,
           coalesce(ck.tutores, 0) AS tutores,
           coalesce(ck.por_atalho, 0) AS por_atalho,
           coalesce(envios.convites, 0) AS convites
      FROM dias
      LEFT JOIN ck ON ck.dia = dias.dia
      LEFT JOIN envios ON envios.dia = dias.dia
     ORDER BY dias.dia
    `,
    [d],
  );
  return rows;
};

/**
 * Faixa 2 — quem está fazendo. Uma linha por tutor com sequência.
 *
 * `pets` sai do junction `pet_owner_pets` (a tabela `pets` não tem owner_id),
 * filtrando `is_active` e `removed_at`, senão pet apagado volta pra tela.
 */
export const getTutors = async ({ days = 30, includeTest = false } = {}) => {
  const d = clampDays(days);
  const { rows } = await pgQuery(
    `
    SELECT
      s.pet_owner_id,
      o.name AS tutor,
      o.cell_phone,
      s.current_streak,
      s.longest_streak,
      s.last_checkin_date,
      (CURRENT_DATE - s.last_checkin_date) AS dias_sem_checkin,
      s.total_points_lifetime,
      coalesce(cfg.paused, false) AS pausado,
      cfg.delivery_time,
      (SELECT count(*) FROM daily_checkins d
        WHERE d.pet_owner_id = s.pet_owner_id
          AND d.checkin_date >= CURRENT_DATE - ($1::int - 1)) AS checkins_janela,
      (SELECT count(*) FROM daily_checkins d
        WHERE d.pet_owner_id = s.pet_owner_id
          AND d.checkin_date >= CURRENT_DATE - ($1::int - 1)
          AND d.source = 'quick_reply') AS por_atalho_janela,
      (SELECT string_agg(p.name, ', ' ORDER BY p.name)
         FROM pet_owner_pets pop
         JOIN pets p ON p.id = pop.pet_id
        WHERE pop.pet_owner_id = s.pet_owner_id
          AND pop.is_active AND pop.removed_at IS NULL) AS pets
    FROM streak_state s
    JOIN pet_owners o ON o.id = s.pet_owner_id
    LEFT JOIN checkin_config cfg ON cfg.pet_owner_id = s.pet_owner_id
    WHERE true ${testFilter(includeTest)}
    ORDER BY s.current_streak DESC NULLS LAST, s.last_checkin_date DESC NULLS LAST
    LIMIT 300
    `,
    [d],
  );
  return rows;
};

/**
 * Faixa 3a — o que está sendo feito: os 3 anéis por degrau.
 *
 * `ring_levels` é array de `{slot, label, level}`. O `label` viaja DENTRO da
 * linha do dia de propósito (decisão do PRD de check-in personalizável): o
 * tutor renomeia o eixo e o histórico continua legível. Por isso agrupo pelo
 * label gravado, não por uma lista fixa de eixos que envelheceria.
 */
export const getRings = async ({ days = 30, includeTest = false } = {}) => {
  const d = clampDays(days);
  const { rows } = await pgQuery(
    `
    SELECT
      r->>'slot' AS slot,
      coalesce(nullif(trim(r->>'label'), ''), '(sem nome)') AS eixo,
      count(*) FILTER (WHERE r->>'level' = 'none')   AS nao_teve,
      count(*) FILTER (WHERE r->>'level' = 'low')    AS pouco,
      count(*) FILTER (WHERE r->>'level' = 'normal') AS normal,
      count(*) FILTER (WHERE r->>'level' = 'great')  AS otimo,
      count(*) FILTER (WHERE r->>'level' IS NULL)    AS sem_degrau,
      count(*) AS total
    FROM daily_checkins d
    JOIN pet_owners o ON o.id = d.pet_owner_id
    CROSS JOIN LATERAL jsonb_array_elements(d.ring_levels) AS r
    WHERE d.ring_levels IS NOT NULL
      AND d.checkin_date >= CURRENT_DATE - ($1::int - 1)
      ${testFilter(includeTest)}
    GROUP BY 1, 2
    ORDER BY 1, total DESC
    `,
    [d],
  );
  return rows;
};

/**
 * Faixa 3b — sinais de saúde marcados.
 *
 * 🚨 Só conta o que vale `true`. A CHAVE aparece no jsonb mesmo quando o tutor
 * NÃO marcou (o formulário manda o campo com `false`), então contar chave
 * presente inflaria de 4x a 12x: medido em 13/08, `nao_comeu` aparece em 37
 * linhas e foi marcado em ZERO.
 */
export const getHealthSignals = async ({ days = 30, includeTest = false } = {}) => {
  const d = clampDays(days);
  const { rows } = await pgQuery(
    `
    SELECT e.k AS sinal,
           count(*) AS marcado,
           count(DISTINCT d.pet_owner_id) AS tutores,
           max(d.checkin_date) AS ultimo
      FROM daily_checkins d
      JOIN pet_owners o ON o.id = d.pet_owner_id
      CROSS JOIN LATERAL jsonb_each(coalesce(d.health_signals, '{}'::jsonb)) AS e(k, v)
     WHERE e.v = 'true'::jsonb
       AND d.checkin_date >= CURRENT_DATE - ($1::int - 1)
       ${testFilter(includeTest)}
     GROUP BY 1
     ORDER BY marcado DESC
     LIMIT 30
    `,
    [d],
  );
  return rows;
};

/** Faixa 3c — missões do período por status. */
export const getMissions = async ({ days = 30, includeTest = false } = {}) => {
  const d = clampDays(days);
  const { rows } = await pgQuery(
    `
    SELECT coalesce(m.status, '(sem status)') AS status,
           coalesce(c.type, '(sem tipo)') AS tipo,
           count(*) AS total,
           count(DISTINCT m.pet_owner_id) AS tutores,
           sum(coalesce(m.bonus_awarded, 0)) AS bonus
      FROM daily_missions m
      JOIN pet_owners o ON o.id = m.pet_owner_id
      LEFT JOIN mission_catalog c ON c.id = m.mission_id
     WHERE m.mission_date >= CURRENT_DATE - ($1::int - 1)
       ${testFilter(includeTest)}
     GROUP BY 1, 2
     ORDER BY total DESC
    `,
    [d],
  );
  return rows;
};

/**
 * Faixa 4 — rankings.
 *
 * Devolve o ÚLTIMO período de cada (period_type, granularity) junto com
 * `gerado_em`. A data não é enfeite: em 13/08/2026 o semanal estava fresco
 * (gerado em 10/08) e o mensal parado no período de junho, gerado em 01/07.
 * Um ranking sem data ao lado mente calado.
 */
export const getRankings = async ({ includeTest = false } = {}) => {
  const { rows } = await pgQuery(
    `
    WITH ultimo AS (
      SELECT period_type, granularity, max(period_start) AS period_start
        FROM leaderboard_snapshots
       GROUP BY 1, 2
    )
    SELECT l.period_type,
           l.granularity,
           l.scope_key,
           l.period_start,
           l.rank,
           l.points,
           l.created_at AS gerado_em,
           o.name AS tutor,
           p.name AS pet
      FROM leaderboard_snapshots l
      JOIN ultimo u
        ON u.period_type = l.period_type
       AND u.granularity = l.granularity
       AND u.period_start = l.period_start
      LEFT JOIN pet_owners o ON o.id = l.pet_owner_id
      LEFT JOIN pets p ON p.id = l.pet_id
     WHERE true ${testFilter(includeTest)}
     ORDER BY l.period_type, l.granularity, l.scope_key, l.rank
     LIMIT 500
    `,
  );
  return rows;
};

export default {
  getPulse,
  getDailySeries,
  getTutors,
  getRings,
  getHealthSignals,
  getMissions,
  getRankings,
};
