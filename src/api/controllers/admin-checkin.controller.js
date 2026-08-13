// Tela de Check-in do admin. Um endpoint só, porque a tela carrega as quatro
// faixas de uma vez — quebrar em cinco chamadas só multiplicaria round-trip
// pra montar uma tela que não é navegável por partes.

import AdminCheckinService from '../services/admin-checkin.service.js';

const parseDays = (raw, fallback = 30) => {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 1) return fallback;
  return Math.min(Math.max(Math.round(n), 1), 365);
};

const parseBool = (raw) => raw === '1' || raw === 'true';

export const overview = async (req, res) => {
  try {
    const days = parseDays(req.query.days);
    const includeTest = parseBool(req.query.include_test);
    const opts = { days, includeTest };

    const [pulse, series, tutors, rings, healthSignals, missions, rankings] = await Promise.all([
      AdminCheckinService.getPulse(opts),
      AdminCheckinService.getDailySeries(opts),
      AdminCheckinService.getTutors(opts),
      AdminCheckinService.getRings(opts),
      AdminCheckinService.getHealthSignals(opts),
      AdminCheckinService.getMissions(opts),
      AdminCheckinService.getRankings(opts),
    ]);

    return res.json({
      code: 'CHECKIN_OVERVIEW',
      data: {
        window_days: days,
        include_test: includeTest,
        pulse,
        series,
        tutors,
        rings,
        health_signals: healthSignals,
        missions,
        rankings,
      },
    });
  } catch (err) {
    console.error('[admin-checkin] overview failed:', err.message);
    return res.status(500).json({ code: 'CHECKIN_OVERVIEW_ERROR', message: err.message });
  }
};

export default { overview };
