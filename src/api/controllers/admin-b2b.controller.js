import AdminB2bService from '../services/admin-b2b.service.js';

const parseDays = (raw, fallback = 30) => {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 1) return fallback;
  return Math.min(Math.max(Math.round(n), 1), 730);
};

// Mês do calendário, em ISO. Sem parâmetro, o mês corrente.
const parseMonth = (raw) => {
  const m = /^(\d{4})-(\d{2})$/.exec(String(raw || ''));
  const now = new Date();
  const year = m ? Number(m[1]) : now.getUTCFullYear();
  const month = m ? Number(m[2]) - 1 : now.getUTCMonth();
  const from = new Date(Date.UTC(year, month, 1));
  const to = new Date(Date.UTC(year, month + 1, 0));
  const iso = (d) => d.toISOString().slice(0, 10);
  return { from: iso(from), to: iso(to), month: iso(from).slice(0, 7) };
};

export const overview = async (req, res) => {
  try {
    const days = parseDays(req.query.days);
    const agendaMonth = parseMonth(req.query.month);
    const opts = { days };

    // `?only=agenda` existe pro passo de mês do calendário. Trocar de mês
    // pedia o overview inteiro — seis queries, incluindo os 200
    // estabelecimentos — e a tela inteira sumia atrás do "Carregando B2B..."
    // enquanto isso. Só a agenda muda quando o mês muda; o resto da tela nem
    // olha pro mês.
    if (String(req.query.only || '') === 'agenda') {
      const agenda = await AdminB2bService.getAgenda(agendaMonth);
      return res.json({
        code: 'B2B_AGENDA',
        data: { agenda_month: agendaMonth.month, agenda },
      });
    }

    const [byCategory, tutors, timeline, agenda, merchants, coverage] = await Promise.all([
      AdminB2bService.getByCategory(opts),
      AdminB2bService.getTutors(opts),
      AdminB2bService.getTimeline(opts),
      AdminB2bService.getAgenda(agendaMonth),
      AdminB2bService.getMerchants(opts),
      AdminB2bService.getCoverage(),
    ]);

    // O vocabulário viaja com o dado: a tela desenha as oito categorias mesmo
    // quando sete estão zeradas, e a união com o observado garante que uma
    // categoria nova apareça mesmo sem ninguém ter traduzido o rótulo.
    const observed = [
      ...byCategory.map((r) => r.category),
      ...coverage.map((r) => r.category),
    ].filter(Boolean);

    return res.json({
      code: 'B2B_OVERVIEW',
      data: {
        window_days: days,
        agenda_month: agendaMonth.month,
        categories: AdminB2bService.mergeCategories(observed),
        purposes: AdminB2bService.B2B_PURPOSES,
        by_category: byCategory,
        tutors,
        timeline,
        agenda,
        merchants,
        coverage,
      },
    });
  } catch (err) {
    console.error('[admin-b2b] overview failed:', err.message);
    return res.status(500).json({ code: 'B2B_OVERVIEW_ERROR', message: err.message });
  }
};

export default { overview };
