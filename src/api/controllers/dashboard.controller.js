import DashboardService from '../services/dashboard.service.js';

const parseRefresh = (q) => q?.refresh === '1' || q?.refresh === 'true';

const getDashboardSummary = async (req, res) => {
  try {
    const summary = await DashboardService.getDashboardSummary({
      window: req.query.window,
      phone: req.query.phone,
      refresh: parseRefresh(req.query),
    });

    return res.status(200).json({
      code: 'DASHBOARD_SUMMARY_RETRIEVED',
      data: summary,
    });
  } catch (error) {
    console.error('Erro ao buscar dashboard summary:', error);
    return res.status(500).json({
      code: 'DASHBOARD_SUMMARY_ERROR',
      message: error.message,
    });
  }
};

const getAbandonedFlows = async (req, res) => {
  try {
    const result = await DashboardService.getAbandonedFlows({
      window: req.query.window,
      refresh: parseRefresh(req.query),
    });

    return res.status(200).json({
      code: 'DASHBOARD_ABANDONED_RETRIEVED',
      data: result,
    });
  } catch (error) {
    console.error('Erro ao buscar dashboard abandoned:', error);
    return res.status(500).json({
      code: 'DASHBOARD_ABANDONED_ERROR',
      message: error.message,
    });
  }
};

const searchPhone = async (req, res) => {
  try {
    const q = req.query.q || req.params.q;
    if (!q) {
      return res.status(400).json({
        code: 'DASHBOARD_SEARCH_QUERY_REQUIRED',
        message: 'q é obrigatório',
      });
    }
    const result = await DashboardService.searchPhone({ q });
    return res.status(200).json({
      code: 'DASHBOARD_SEARCH_RETRIEVED',
      data: result,
    });
  } catch (error) {
    console.error('Erro ao buscar phone:', error);
    return res.status(500).json({
      code: 'DASHBOARD_SEARCH_ERROR',
      message: error.message,
    });
  }
};

const getFunnelStep = async (req, res) => {
  try {
    const step = req.params.step || req.query.step;
    if (!step) {
      return res.status(400).json({
        code: 'DASHBOARD_FUNNEL_STEP_REQUIRED',
        message: 'step é obrigatório',
      });
    }
    let isPro;
    if (req.query.is_pro === 'true') isPro = true;
    else if (req.query.is_pro === 'false') isPro = false;

    const result = await DashboardService.getFunnelStep({
      step,
      window: req.query.window,
      scope: req.query.scope,
      isPro,
      refresh: parseRefresh(req.query),
    });

    return res.status(200).json({
      code: 'DASHBOARD_FUNNEL_STEP_RETRIEVED',
      data: result,
    });
  } catch (error) {
    console.error('Erro ao buscar funnel step:', error);
    return res.status(500).json({
      code: 'DASHBOARD_FUNNEL_STEP_ERROR',
      message: error.message,
    });
  }
};

const getContactDrilldown = async (req, res) => {
  try {
    const phone = req.params.phone || req.query.phone;
    if (!phone) {
      return res.status(400).json({
        code: 'DASHBOARD_DRILLDOWN_PHONE_REQUIRED',
        message: 'phone é obrigatório',
      });
    }
    const result = await DashboardService.getContactDrilldown({ phone });

    return res.status(200).json({
      code: 'DASHBOARD_DRILLDOWN_RETRIEVED',
      data: result,
    });
  } catch (error) {
    console.error('Erro ao buscar dashboard drilldown:', error);
    return res.status(500).json({
      code: 'DASHBOARD_DRILLDOWN_ERROR',
      message: error.message,
    });
  }
};

const getOnboardingFunnel = async (req, res) => {
  try {
    const { window, scope } = req.query;
    let isPro;
    if (req.query.is_pro === 'true') isPro = true;
    else if (req.query.is_pro === 'false') isPro = false;

    const result = await DashboardService.getOnboardingFunnel({
      window,
      scope,
      isPro,
      refresh: parseRefresh(req.query),
    });

    return res.status(200).json({
      code: 'DASHBOARD_ONBOARDING_FUNNEL_RETRIEVED',
      data: result,
    });
  } catch (error) {
    console.error('Erro ao buscar dashboard onboarding funnel:', error);
    return res.status(500).json({
      code: 'DASHBOARD_ONBOARDING_FUNNEL_ERROR',
      message: error.message,
    });
  }
};

const getProRevenueChannels = async (req, res) => {
  try {
    const result = await DashboardService.getProRevenueChannels({
      refresh: parseRefresh(req.query),
    });

    return res.status(200).json({
      code: 'DASHBOARD_PRO_REVENUE_CHANNELS_RETRIEVED',
      data: result,
    });
  } catch (error) {
    console.error('Erro ao buscar dashboard pro revenue channels:', error);
    return res.status(500).json({
      code: 'DASHBOARD_PRO_REVENUE_CHANNELS_ERROR',
      message: error.message,
    });
  }
};

const getActivityFunnel = async (req, res) => {
  try {
    const { window, scope } = req.query;
    let isPro;
    if (req.query.is_pro === 'true') isPro = true;
    else if (req.query.is_pro === 'false') isPro = false;

    const result = await DashboardService.getActivityFunnel({
      window,
      scope,
      isPro,
      refresh: parseRefresh(req.query),
    });

    return res.status(200).json({
      code: 'DASHBOARD_ACTIVITY_FUNNEL_RETRIEVED',
      data: result,
    });
  } catch (error) {
    console.error('Erro ao buscar dashboard activity funnel:', error);
    return res.status(500).json({
      code: 'DASHBOARD_ACTIVITY_FUNNEL_ERROR',
      message: error.message,
    });
  }
};

const getCohortRetention = async (req, res) => {
  try {
    const lookbackRaw = req.query.lookback_days;
    const lookbackDays = lookbackRaw != null ? parseInt(lookbackRaw, 10) : undefined;

    const result = await DashboardService.getCohortRetention({
      lookbackDays: Number.isFinite(lookbackDays) ? lookbackDays : undefined,
      refresh: parseRefresh(req.query),
    });

    return res.status(200).json({
      code: 'DASHBOARD_COHORT_RETENTION_RETRIEVED',
      data: result,
    });
  } catch (error) {
    console.error('Erro ao buscar dashboard cohort retention:', error);
    return res.status(500).json({
      code: 'DASHBOARD_COHORT_RETENTION_ERROR',
      message: error.message,
    });
  }
};

export default {
  getDashboardSummary,
  getAbandonedFlows,
  getContactDrilldown,
  getFunnelStep,
  getOnboardingFunnel,
  getActivityFunnel,
  getProRevenueChannels,
  getCohortRetention,
  searchPhone,
};
