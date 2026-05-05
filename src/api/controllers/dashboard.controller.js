import DashboardService from '../services/dashboard.service.js';

const getDashboardSummary = async (req, res) => {
  try {
    const refresh = req.query.refresh === '1' || req.query.refresh === 'true';
    const summary = await DashboardService.getDashboardSummary({ refresh });

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

export default { getDashboardSummary };
