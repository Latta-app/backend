import AdminB2bService from '../services/admin-b2b.service.js';

const parseDays = (raw, fallback = 90) => {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 1) return fallback;
  return Math.min(Math.max(Math.round(n), 1), 730);
};

const parseBool = (raw) => raw === '1' || raw === 'true';

export const overview = async (req, res) => {
  try {
    const days = parseDays(req.query.days);
    const includeTest = parseBool(req.query.include_test);
    const opts = { days, includeTest };

    const [byCategory, timeline, agenda, merchants, coverage] = await Promise.all([
      AdminB2bService.getByCategory(opts),
      AdminB2bService.getTimeline(opts),
      AdminB2bService.getAgenda({ includeTest }),
      AdminB2bService.getMerchants(opts),
      AdminB2bService.getCoverage(),
    ]);

    // O vocabulário vai junto com o dado: a tela precisa desenhar as oito
    // categorias mesmo quando sete não têm acionamento, e sem a lista ela só
    // saberia das que apareceram no GROUP BY. A união com o que o banco
    // devolveu garante que uma categoria nova apareça mesmo que ninguém tenha
    // atualizado o dicionário de rótulos.
    const observed = [
      ...byCategory.map((r) => r.category),
      ...coverage.map((r) => r.category),
    ].filter(Boolean);

    return res.json({
      code: 'B2B_OVERVIEW',
      data: {
        window_days: days,
        include_test: includeTest,
        categories: AdminB2bService.mergeCategories(observed),
        purposes: AdminB2bService.B2B_PURPOSES,
        by_category: byCategory,
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
