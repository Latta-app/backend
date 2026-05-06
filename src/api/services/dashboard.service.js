const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const DASHBOARD_METRICS_URL = `${SUPABASE_URL}/functions/v1/dashboard-metrics`;

const ALLOWED_WINDOWS = new Set(['24h', '7d', '30d', '90d']);
const ALLOWED_ACTIONS = new Set([
  'summary',
  'abandoned',
  'drilldown',
  'funnel_step',
  'search',
]);
const ALLOWED_FUNNEL_STEPS = new Set([
  'talked',
  'onboarded',
  'utilized',
  'purchased',
  'pro',
]);

const buildUrl = ({ action, window, phone, step, scope, q, refresh }) => {
  const params = new URLSearchParams();
  if (action && action !== 'summary') params.set('action', action);
  if (window) params.set('window', window);
  if (phone) params.set('phone', phone);
  if (step) params.set('step', step);
  if (scope) params.set('scope', scope);
  if (q) params.set('q', q);
  if (refresh) params.set('refresh', '1');
  const query = params.toString();
  return query ? `${DASHBOARD_METRICS_URL}?${query}` : DASHBOARD_METRICS_URL;
};

const callDashboardMetrics = async ({
  action = 'summary',
  window,
  phone,
  step,
  scope,
  q,
  refresh = false,
} = {}) => {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são obrigatórios');
  }
  if (!ALLOWED_ACTIONS.has(action)) {
    throw new Error(`action inválida: ${action}`);
  }
  if (window && !ALLOWED_WINDOWS.has(window)) {
    throw new Error(`window inválida: ${window}`);
  }
  if (action === 'drilldown' && !phone) {
    throw new Error('phone é obrigatório para drilldown');
  }
  if (action === 'funnel_step') {
    if (!step) throw new Error('step é obrigatório para funnel_step');
    if (!ALLOWED_FUNNEL_STEPS.has(step)) {
      throw new Error(`step inválido: ${step}`);
    }
  }
  if (phone && !/^\d{10,15}$/.test(phone)) {
    throw new Error('phone inválido (apenas dígitos, 10-15)');
  }
  if (action === 'search') {
    if (!q) throw new Error('q é obrigatório para search');
    const digits = String(q).replace(/\D/g, '');
    if (digits.length < 6) throw new Error('q deve ter pelo menos 6 dígitos');
  }

  const url = buildUrl({ action, window, phone, step, scope, q, refresh });
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

const getDashboardSummary = async ({ window, phone, refresh } = {}) =>
  callDashboardMetrics({ action: 'summary', window, phone, refresh });

const getAbandonedFlows = async ({ window, refresh } = {}) =>
  callDashboardMetrics({ action: 'abandoned', window, refresh });

const getContactDrilldown = async ({ phone } = {}) =>
  callDashboardMetrics({ action: 'drilldown', phone });

const getFunnelStep = async ({ step, window, scope, refresh } = {}) =>
  callDashboardMetrics({ action: 'funnel_step', step, window, scope, refresh });

const searchPhone = async ({ q } = {}) =>
  callDashboardMetrics({ action: 'search', q });

export default {
  getDashboardSummary,
  getAbandonedFlows,
  getContactDrilldown,
  getFunnelStep,
  searchPhone,
};
