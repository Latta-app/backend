// clinic-interest-lead.service.js
// Persiste o lead em scheduling_sessions (whoops, em clinic_interest_leads) e
// dispara email pra comercial@latta.app.br via Resend, se RESEND_API_KEY estiver
// configurado. Quando nao tem RESEND_API_KEY, marca email_sent=false +
// email_error="resend_not_configured" pra time comercial conferir manualmente.

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const COMMERCIAL_EMAIL = process.env.CLINIC_LEAD_TO || 'comercial@latta.app.br';
const COMMERCIAL_FROM = process.env.CLINIC_LEAD_FROM || 'Latta <leads@latta.app.br>';

const LEADS_URL = `${SUPABASE_URL}/rest/v1/clinic_interest_leads`;

const insertLead = async (payload) => {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.warn('[clinic-interest-lead] Supabase env vars ausentes, lead nao persistido');
    return null;
  }

  const res = await fetch(LEADS_URL, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Falha ao gravar lead (${res.status}): ${body.slice(0, 200)}`);
  }

  const rows = await res.json();
  return Array.isArray(rows) ? rows[0] : rows;
};

const updateLead = async (id, patch) => {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !id) return;
  fetch(`${LEADS_URL}?id=eq.${id}`, {
    method: 'PATCH',
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify(patch),
  }).catch((err) => {
    console.error('[clinic-interest-lead] Falha ao atualizar lead:', err?.message);
  });
};

const sendCommercialEmail = async ({ section, name, email, message, clinicId, clinicName }) => {
  if (!RESEND_API_KEY) {
    return { sent: false, error: 'resend_not_configured' };
  }

  const subject = `[Painel Clinica] Lead em ${section}: ${name}`;
  const html = `
    <h2>Novo interesse no painel da clinica</h2>
    <ul>
      <li><b>Clinica:</b> ${escapeHtml(clinicName || clinicId || 'desconhecida')}</li>
      <li><b>Secao clicada:</b> ${escapeHtml(section)}</li>
      <li><b>Nome:</b> ${escapeHtml(name)}</li>
      <li><b>Email:</b> ${escapeHtml(email)}</li>
      <li><b>Mensagem:</b> ${message ? escapeHtml(message) : '<i>(sem mensagem)</i>'}</li>
      <li><b>Quando:</b> ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}</li>
    </ul>
  `;

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: COMMERCIAL_FROM,
        to: [COMMERCIAL_EMAIL],
        reply_to: email,
        subject,
        html,
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      return { sent: false, error: `resend_${res.status}: ${body.slice(0, 200)}` };
    }
    return { sent: true };
  } catch (err) {
    return { sent: false, error: `resend_throw: ${err.message}` };
  }
};

const escapeHtml = (str) =>
  String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const submitLead = async ({
  section,
  name,
  email,
  message,
  clinicId,
  clinicName,
  userId,
  userAgent,
  ipAddress,
}) => {
  const lead = await insertLead({
    clinic_id: clinicId || null,
    user_id: userId || null,
    section,
    name,
    email,
    message: message || null,
    user_agent: userAgent || null,
    ip_address: ipAddress || null,
  });

  const emailResult = await sendCommercialEmail({
    section,
    name,
    email,
    message,
    clinicId,
    clinicName,
  });

  if (lead?.id) {
    updateLead(lead.id, {
      email_sent: emailResult.sent,
      email_error: emailResult.error || null,
    });
  }

  return { lead, emailResult };
};

export default { submitLead };
