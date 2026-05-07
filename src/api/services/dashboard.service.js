const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const DASHBOARD_METRICS_URL = `${SUPABASE_URL}/functions/v1/dashboard-metrics`;

const ALLOWED_WINDOWS = new Set(['24h', '7d', '30d', '90d']);
const ALLOWED_ACTIONS = new Set([
  'summary',
  'abandoned',
  'drilldown',
  'funnel_step',
  'onboarding_funnel',
  'activity_funnel',
  'pro_revenue_channels',
  'cohort_retention',
  'time_to_event',
  'search',
]);

const ALLOWED_TIME_TO_EVENT = new Set(['first_purchase', 'first_pro', 'first_utilization']);
const ALLOWED_FUNNEL_STEPS = new Set([
  // Steps legados (funil macro)
  'talked',
  'onboarded',
  'utilized',
  'purchased',
  'pro',
  // Steps internos do Onboarding V3 (cohort base = contacts criados na janela)
  'messaged',
  'pet_registered',
  'pet_confirmed',
  'pro_decision',
  'hub_action',
  'completed',
]);
const ALLOWED_ONBOARDING_SCOPES = new Set(['cohort', 'all']);

const buildUrl = ({
  action,
  window,
  phone,
  step,
  scope,
  q,
  isPro,
  lookbackDays,
  event,
  includeTest,
  refresh,
}) => {
  const params = new URLSearchParams();
  if (action && action !== 'summary') params.set('action', action);
  if (window) params.set('window', window);
  if (phone) params.set('phone', phone);
  if (step) params.set('step', step);
  if (scope) params.set('scope', scope);
  if (q) params.set('q', q);
  if (isPro === true) params.set('is_pro', 'true');
  else if (isPro === false) params.set('is_pro', 'false');
  if (lookbackDays != null) params.set('lookback_days', String(lookbackDays));
  if (event) params.set('event', event);
  if (includeTest === true) params.set('include_test', 'true');
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
  isPro,
  lookbackDays,
  event,
  includeTest,
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
  if (action === 'onboarding_funnel') {
    if (scope && !ALLOWED_ONBOARDING_SCOPES.has(scope)) {
      throw new Error(`scope inválido para onboarding_funnel: ${scope}`);
    }
    if (isPro !== undefined && isPro !== null && typeof isPro !== 'boolean') {
      throw new Error('isPro deve ser boolean (ou omitido para "todos")');
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

  if (action === 'time_to_event' && event && !ALLOWED_TIME_TO_EVENT.has(event)) {
    throw new Error(`event inválido: ${event}`);
  }

  const url = buildUrl({ action, window, phone, step, scope, q, isPro, lookbackDays, event, includeTest, refresh });
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

const getFunnelStep = async ({ step, window, scope, isPro, includeTest, refresh } = {}) =>
  callDashboardMetrics({ action: 'funnel_step', step, window, scope, isPro, includeTest, refresh });

const getOnboardingFunnel = async ({ window, scope, isPro, includeTest, refresh } = {}) =>
  callDashboardMetrics({ action: 'onboarding_funnel', window, scope, isPro, includeTest, refresh });

const getActivityFunnel = async ({ window, scope, isPro, includeTest, refresh } = {}) =>
  callDashboardMetrics({ action: 'activity_funnel', window, scope, isPro, includeTest, refresh });

const getProRevenueChannels = async ({ includeTest, refresh } = {}) =>
  callDashboardMetrics({ action: 'pro_revenue_channels', includeTest, refresh });

const getCohortRetention = async ({ lookbackDays, includeTest, refresh } = {}) =>
  callDashboardMetrics({ action: 'cohort_retention', lookbackDays, includeTest, refresh });

const getTimeToEvent = async ({ window, event, includeTest, refresh } = {}) =>
  callDashboardMetrics({ action: 'time_to_event', window, event, includeTest, refresh });

const searchPhone = async ({ q } = {}) =>
  callDashboardMetrics({ action: 'search', q });

export default {
  getDashboardSummary,
  getAbandonedFlows,
  getContactDrilldown,
  getFunnelStep,
  getOnboardingFunnel,
  getActivityFunnel,
  getProRevenueChannels,
  getCohortRetention,
  getTimeToEvent,
  searchPhone,
};
