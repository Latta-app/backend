import ClinicActivityLogService from '../services/clinic-activity-log.service.js';

const parseDays = (raw, fallback = 30) => {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 1) return fallback;
  return Math.min(Math.max(Math.round(n), 1), 365);
};

export const aggregates = async (req, res) => {
  try {
    const days = parseDays(req.query.days);
    const rows = await ClinicActivityLogService.getClinicAggregates({ days });
    return res.json({
      code: 'CLINIC_ACTIVITY_AGGREGATES',
      data: { window_days: days, clinics: rows },
    });
  } catch (err) {
    console.error('[admin-clinic-activity] aggregates failed:', err.message);
    return res.status(500).json({ code: 'AGGREGATES_ERROR', message: err.message });
  }
};

export const timeline = async (req, res) => {
  try {
    const { id } = req.params;
    const limit = req.query.limit ? Number(req.query.limit) : 200;
    const rows = await ClinicActivityLogService.getClinicTimeline({ clinicId: id, limit });
    return res.json({ code: 'CLINIC_ACTIVITY_TIMELINE', data: { clinic_id: id, events: rows } });
  } catch (err) {
    console.error('[admin-clinic-activity] timeline failed:', err.message);
    return res.status(500).json({ code: 'TIMELINE_ERROR', message: err.message });
  }
};

export const lockedRanking = async (req, res) => {
  try {
    const days = parseDays(req.query.days);
    const rows = await ClinicActivityLogService.getLockedSectionRanking({ days });
    return res.json({
      code: 'CLINIC_LOCKED_RANKING',
      data: { window_days: days, sections: rows },
    });
  } catch (err) {
    console.error('[admin-clinic-activity] ranking failed:', err.message);
    return res.status(500).json({ code: 'RANKING_ERROR', message: err.message });
  }
};

export default { aggregates, timeline, lockedRanking };
