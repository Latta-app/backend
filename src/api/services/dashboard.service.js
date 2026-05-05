const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const DASHBOARD_METRICS_URL = `${SUPABASE_URL}/functions/v1/dashboard-metrics`;

const getDashboardSummary = async ({ refresh = false } = {}) => {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são obrigatórios');
  }

  const url = refresh ? `${DASHBOARD_METRICS_URL}?refresh=1` : DASHBOARD_METRICS_URL;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`dashboard-metrics EF retornou ${res.status}: ${text}`);
  }

  return res.json();
};

export default { getDashboardSummary };
