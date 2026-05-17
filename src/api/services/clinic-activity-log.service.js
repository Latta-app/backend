// clinic-activity-log.service.js
// Fire-and-forget logging do engajamento da clinica. Pattern espelhado da
// dashboard-audit.service.js: usa PostgREST com service_role + .catch() no
// fetch pra nao bloquear o controller em caso de erro.
//
// Uso: importar `logClinicActivity()` no controller e chamar APOS responder
// (ou antes — fire-and-forget, nao aguarda). Tambem expoe helpers de query
// pra dashboard admin (aggregates + timeline).

import { pgQuery } from '../../config/postgres.js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const LOG_URL = `${SUPABASE_URL}/rest/v1/clinic_activity_log`;

export const logClinicActivity = ({
  clinicId = null,
  userId = null,
  userEmail = null,
  eventType,
  eventData = null,
  ipAddress = null,
  userAgent = null,
} = {}) => {
  if (!eventType) return;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return;

  const body = {
    clinic_id: clinicId || null,
    user_id: userId || null,
    user_email: userEmail || null,
    event_type: eventType,
    event_data: eventData || {},
    ip_address: ipAddress || null,
    user_agent: userAgent ? userAgent.slice(0, 500) : null,
  };

  fetch(LOG_URL, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify(body),
  }).catch((err) => {
    console.error('[clinic-activity-log] insert failed:', err?.message);
  });
};

// Helper pra extrair contexto do request rapido
export const logFromReq = (req, eventType, eventData = null) => {
  const userId = req?.user?.id || null;
  const userEmail = req?.user?.email || null;
  const clinicId = req?.user?.clinic_id || req?.user?.role?.clinic_id || null;
  const ip =
    req?.headers?.['x-forwarded-for']?.toString().split(',')[0]?.trim() ||
    req?.ip ||
    null;
  const ua = req?.headers?.['user-agent'] || null;
  logClinicActivity({
    clinicId,
    userId,
    userEmail,
    eventType,
    eventData,
    ipAddress: ip,
    userAgent: ua,
  });
};

// ============================================================================
// Queries pra dashboard admin
// ============================================================================

const N_DAYS_DEFAULT = 30;

export const getClinicAggregates = async ({ days = N_DAYS_DEFAULT } = {}) => {
  const { rows } = await pgQuery(
    `
    WITH ranged AS (
      SELECT *
      FROM clinic_activity_log
      WHERE created_at >= now() - ($1 || ' days')::interval
    )
    SELECT
      c.id AS clinic_id,
      c.name AS clinic_name,
      count(*) FILTER (WHERE r.event_type = 'login') AS logins,
      count(*) FILTER (WHERE r.event_type = 'view_appointment_detail') AS views_detail,
      count(*) FILTER (WHERE r.event_type = 'click_locked_section') AS clicks_locked,
      count(*) FILTER (WHERE r.event_type = 'submit_interest_lead') AS leads_submitted,
      count(*) FILTER (WHERE r.event_type LIKE 'external_%') AS external_actions,
      count(*) FILTER (WHERE r.event_type = 'scheduling_cancelled' OR r.event_type = 'scheduling_confirmed') AS scheduling_actions,
      max(r.created_at) AS last_activity_at,
      count(*) AS total_events
    FROM clinics c
    LEFT JOIN ranged r ON r.clinic_id = c.id
    GROUP BY c.id, c.name
    ORDER BY last_activity_at DESC NULLS LAST, total_events DESC
    LIMIT 200
    `,
    [String(days)],
  );
  return rows;
};

export const getClinicTimeline = async ({ clinicId, limit = 200 }) => {
  const { rows } = await pgQuery(
    `
    SELECT id, user_id, user_email, event_type, event_data, ip_address, created_at
    FROM clinic_activity_log
    WHERE clinic_id = $1
    ORDER BY created_at DESC
    LIMIT $2
    `,
    [clinicId, Math.min(Math.max(limit, 1), 500)],
  );
  return rows;
};

export const getLockedSectionRanking = async ({ days = N_DAYS_DEFAULT } = {}) => {
  const { rows } = await pgQuery(
    `
    SELECT
      coalesce(event_data->>'section', '(unknown)') AS section,
      count(DISTINCT clinic_id) AS clinics_clicked,
      count(*) AS total_clicks,
      max(created_at) AS last_click_at
    FROM clinic_activity_log
    WHERE event_type IN ('click_locked_section', 'submit_interest_lead')
      AND created_at >= now() - ($1 || ' days')::interval
    GROUP BY 1
    ORDER BY total_clicks DESC
    LIMIT 50
    `,
    [String(days)],
  );
  return rows;
};

export default { logClinicActivity, logFromReq, getClinicAggregates, getClinicTimeline, getLockedSectionRanking };
