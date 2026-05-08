// dashboard-audit.service.js
// Audit trail LGPD do dashboard. Fire-and-forget — nunca bloqueia a
// response do controller. Insere via PostgREST com service_role.
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const AUDIT_URL = `${SUPABASE_URL}/rest/v1/dashboard_audit_log`;

const logAudit = ({ userId, userEmail, action, targetPhone, targetPetOwnerId, metadata } = {}) => {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return;
  if (!userId || !action) return;

  const body = {
    user_id: userId,
    user_email: userEmail || null,
    action,
    target_phone: targetPhone || null,
    target_pet_owner_id: targetPetOwnerId || null,
    metadata: metadata || null,
  };

  // fire-and-forget: nao await
  fetch(AUDIT_URL, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify(body),
  }).catch((err) => {
    console.error('Failed to write dashboard audit log:', err?.message);
  });
};

export default { logAudit };
