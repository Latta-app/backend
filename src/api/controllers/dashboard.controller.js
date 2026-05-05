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

export default {
  getDashboardSummary,
  getAbandonedFlows,
  getContactDrilldown,
};
