// Admin dashboard metrics pro scheduling agent (Fatia 5 do plano
// scheduling-agent-state-of-the-art). Proxy pra RPC Postgres
// `public.get_scheduling_metrics(days_back)` que agrega no banco.

import { sequelize } from '../../config/database.js';
import { QueryTypes } from 'sequelize';

const parseDays = (raw, fallback = 7) => {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 1) return fallback;
  return Math.min(Math.max(Math.round(n), 1), 365);
};

export const schedulingMetrics = async (req, res) => {
  try {
    const days = parseDays(req.query.days);
    const rows = await sequelize.query(
      'SELECT public.get_scheduling_metrics(:days) AS metrics',
      {
        type: QueryTypes.SELECT,
        replacements: { days },
      },
    );
    const metrics = rows?.[0]?.metrics ?? {};
    return res.json({
      code: 'SCHEDULING_METRICS',
      data: metrics,
    });
  } catch (err) {
    console.error('[admin-scheduling-metrics] failed:', err.message);
    return res.status(500).json({ code: 'METRICS_ERROR', message: err.message });
  }
};

export default { schedulingMetrics };
