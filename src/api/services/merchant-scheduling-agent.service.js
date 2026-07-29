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
// 08H — auth interna da EF. Ela recusa com 401 TODA operation mutante quando
// SCHEDULING_INTERNAL_SECRET existe do lado dela (merchant-scheduling-agent/
// index.ts:98-113), e o header nunca era enviado daqui: as três ações do painel
// (cancelar / não compareceu / remarcar) tomavam 401, o estado não mudava e o
// tutor não era avisado — o agendamento seguia CONFIRMED e virava COMPLETED
// sozinho 24h depois. Medido em prod 29/07 com um probe de session_id zerado.
const SCHEDULING_INTERNAL_SECRET = process.env.SCHEDULING_INTERNAL_SECRET;
const EF_URL = `${SUPABASE_URL}/functions/v1/merchant-scheduling-agent`;

// O header é condicional pra não quebrar o boot, mas a ausência da env NÃO pode
// passar calada: sem ela as três ações do painel continuam tomando 401, e o modo
// de falha é silencioso do ponto de vista da clínica.
if (!SCHEDULING_INTERNAL_SECRET) {
  console.warn(
    '[merchant-scheduling-agent] SCHEDULING_INTERNAL_SECRET ausente — ' +
      'cancelar/não compareceu/remarcar vão receber 401 da EF. ' +
      'Defina a env (mesmo valor do secret da EF no Supabase) e reinicie.',
  );
}

const callEf = async (payload) => {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('SUPABASE env vars ausentes — EF call abortada');
  }
  const res = await fetch(EF_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      // Condicional de propósito: é o mesmo rollout escalonado que a chat-engine
      // usa (chat-engine/index.ts:3508-3514) e que o gate da EF assume — o caller
      // ganha o header ANTES de a env existir, e passa a funcionar sozinho quando
      // ela chega, sem novo deploy. Mandar string vazia daria 401 igual.
      ...(SCHEDULING_INTERNAL_SECRET
        ? { 'x-latta-internal-secret': SCHEDULING_INTERNAL_SECRET }
        : {}),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok || !body?.success) {
    // 401 aqui é quase sempre a env ausente/divergente, não credencial do caller.
    // Sem esta pista o erro chega como "unauthorized" cru e manda quem debuga
    // caçar problema de auth do painel, que não é onde ele está.
    if (res.status === 401) {
      console.error(
        `[merchant-scheduling-agent] 401 em ${payload.operation}: header interno ` +
          `${SCHEDULING_INTERNAL_SECRET ? 'enviado mas recusado (valor diverge do secret da EF?)' : 'NÃO enviado (env ausente)'}`,
      );
    }
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
