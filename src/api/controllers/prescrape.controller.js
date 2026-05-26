import axios from 'axios';

/**
 * Background pre-scrape worker (substitui pre-scrape inline da EF).
 *
 * Por que existe:
 *   - EF Supabase tem hard limit de 2s CPU por request (todos os planos).
 *   - productDetails consome ~325ms CPU (MozJPEG da screenshot é o gargalo).
 *   - 5 productDetails serial dentro do mesmo EF call estoura o limite,
 *     especialmente sob concorrência (2 buscas seguidas = 2 pre-scrapes
 *     concorrentes na mesma instance = CPU exceeded).
 *
 * Solução:
 *   - EF identifica top 5 not-in-DB e POSTa pra esse endpoint.
 *   - Aqui despachamos 5 EF calls PARALELAS, cada uma com operation
 *     "preheat_product" processando 1 produto. Cada call = própria instance =
 *     próprio orçamento de 2s CPU.
 *   - Backend EC2 não tem hard CPU limit por request (VM dedicada) — só
 *     orquestra HTTP calls.
 *
 * Escala:
 *   - 1000 users simultâneos = 1000 disparos = 5000 EF calls paralelas
 *     que escalam horizontalmente na infra Supabase. Sem estouro.
 */
const triggerPrescrape = async (req, res) => {
  const { phone, product_ids } = req.body || {};

  if (!phone || !Array.isArray(product_ids) || product_ids.length === 0) {
    return res.status(400).json({
      code: 'INVALID_INPUT',
      message: 'phone + product_ids[] required',
    });
  }

  // Cap em 5 — top visível do user. Vai além disso é desperdício
  // (provavelmente fora do que ele vê na primeira tela).
  const ids = product_ids.slice(0, 5);

  // Dispatch async (fire-and-forget). Express envia 202 imediatamente
  // pra EF — não bloqueia o caller.
  processPrescrapeAsync(phone, ids).catch((err) =>
    console.error(`[prescrape] async dispatch error phone=${phone}:`, err.message),
  );

  return res.status(202).json({
    code: 'ACCEPTED',
    count: ids.length,
  });
};

/**
 * Dispara N HTTP calls paralelas pra EF marketplace-service, cada uma
 * processando 1 produto. Cada call = seu próprio CPU budget.
 */
const processPrescrapeAsync = async (phone, ids) => {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.error('[prescrape] missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars');
    return;
  }

  const efUrl = `${supabaseUrl}/functions/v1/marketplace-service`;
  const start = Date.now();
  console.log(`[prescrape] START phone=${phone} count=${ids.length} ids=${ids.join(',')}`);

  const results = await Promise.allSettled(
    ids.map((product_id) =>
      axios
        .post(
          efUrl,
          { operation: 'preheat_product', phone, product_id },
          {
            headers: {
              Authorization: `Bearer ${supabaseKey}`,
              'Content-Type': 'application/json',
            },
            timeout: 30000,
            validateStatus: () => true, // accept any HTTP status
          },
        )
        .then((r) => ({
          product_id,
          ok: r.status >= 200 && r.status < 300,
          status: r.status,
          data: r.data,
        }))
        .catch((err) => ({
          product_id,
          ok: false,
          status: 0,
          err: err.message,
        })),
    ),
  );

  const ok = results.filter((r) => r.status === 'fulfilled' && r.value.ok).length;
  const failed = results
    .filter((r) => r.status === 'fulfilled' && !r.value.ok)
    .map((r) => `${r.value.product_id}(${r.value.status || r.value.err})`);

  const ms = Date.now() - start;
  console.log(
    `[prescrape] DONE phone=${phone} ok=${ok}/${ids.length} ms=${ms}` +
      (failed.length > 0 ? ` failed=[${failed.join(',')}]` : ''),
  );
};

export default { triggerPrescrape };
