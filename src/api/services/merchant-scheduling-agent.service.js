// merchant-scheduling-agent.service.js
// HTTP client pra invocar operações da EF merchant-scheduling-agent.
// Usado pelos endpoints PATCH /scheduling/:id/{cancel,no-show,reschedule}
// quando role=clinic dispara via painel.
//
// Em vez de mexer no DB direto (que era o padrão antigo do cancel),
// chama a EF que faz: UPDATE state + state_history + dispara template
// pro tutor via WhatsApp. Garante que o agent fica em sync.

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const EF_URL = `${SUPABASE_URL}/functions/v1/merchant-scheduling-agent`;

const callEf = async (payload) => {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('SUPABASE env vars ausentes — EF call abortada');
  }
  const res = await fetch(EF_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok || !body?.success) {
    const err = new Error(body?.error || `EF returned ${res.status}`);
    err.status = res.status;
    err.efDetail = body;
    throw err;
  }
  return body;
};

export const cancelByMerchant = ({ sessionId, reason }) =>
  callEf({ operation: 'cancel_by_merchant', session_id: sessionId, reason });

export const noShowByMerchant = ({ sessionId, reason }) =>
  callEf({ operation: 'no_show_by_merchant', session_id: sessionId, reason });

export const rescheduleByMerchant = ({ sessionId, newScheduledDate, newScheduledService, reason }) =>
  callEf({
    operation: 'reschedule_by_merchant',
    session_id: sessionId,
    new_scheduled_date: newScheduledDate,
    new_scheduled_service: newScheduledService,
    reason,
  });

export default { cancelByMerchant, noShowByMerchant, rescheduleByMerchant };
