import { pgQuery } from '../../config/postgres.js';

// Leitura da economia de lattinhas para o painel da mensageria.
//
// Ref: docs/issues/painel-lattinhas/ (repo Latta) — fatia 02.
//
// 🚨 LEITURA, ponta a ponta. Nada aqui credita, debita ou corrige. Crédito é da
// EF/RPC; este módulo só mostra o que aconteceu — inclusive o feio (cancelado,
// pendente, negativo, repetido), que é a razão do painel existir.

// O rótulo PT-BR sai de `coin_actions.description_pt` (fatia 01). O fallback é
// FECHADO: ação sem catálogo vira "Ação registrada", nunca o `action_key` cru na
// tela do operador (general-rules → Mensageria). É a mesma decisão que o
// `TEMPLATE_LABELS` da mensageria pagou caro pra aprender.
const ACTION_LABEL_FALLBACK = 'Ação registrada';

// O pedido que originou o cashback, quando a linha é de compra.
//
// 🚨 A junção é por `marketplace_order_number`, NÃO por `marketplace_order_id`.
// As duas colunas existem na MESMA linha de `orders` e carregam números
// diferentes (o pedido da Valeria é number=493363734 / id=1354253258). O ledger
// grava o `number` em `reference_id` — juntar pelo `id` acha zero linhas e o
// painel conclui, calado, que nenhum cashback tem pedido.
//
// Vai `LEFT`: crédito sem pedido correspondente existe (tutor purgado leva o
// pedido junto — 3 casos medidos em 04/08) e não pode sumir do extrato por
// causa disso.
//
// Os campos são os que respondem "pontuou certo?": a base do cálculo
// (`subtotal` − `discount`), o que o tutor pagou (`total`), e a origem, que é o
// que diz se aquele pedido PODIA pontuar.
const ENTRIES_SELECT = `
  SELECT
    l.id,
    l.action_key,
    COALESCE(NULLIF(a.description_pt, ''), $2) AS action_label,
    l.coins_earned,
    l.status,
    l.bucket,
    l.is_premium,
    l.reference_id,
    l.note,
    l.created_at,
    l.available_at,
    CASE WHEN l.action_key = 'purchase' AND ord.id IS NOT NULL THEN
      jsonb_build_object(
        'order_number',      ord.marketplace_order_number,
        'marketplace_id',    ord.marketplace_order_id,
        'source',            ord.source,
        'status',            ord.status,
        'status_label',      ord.current_status_name,
        'subtotal',          ord.subtotal,
        'discount',          ord.discount,
        'shipping_cost',     ord.shipping_cost,
        'service_fee',       ord.service_fee,
        'total',             ord.total,
        'items_count',       ord.items_count,
        'payment_method',    ord.payment_method,
        'created_at',        ord.created_at
      )
    END AS order_ref
  FROM latta_coins_ledger l
  LEFT JOIN coin_actions a ON a.action_key = l.action_key
  LEFT JOIN orders ord
         ON l.action_key = 'purchase'
        AND ord.marketplace_order_number = l.reference_id
        AND ord.pet_owner_id = l.pet_owner_id
  WHERE l.pet_owner_id = $1
  ORDER BY l.created_at DESC, l.id DESC
  LIMIT $3 OFFSET $4
`;

/**
 * Página do extrato, mais recente primeiro (decisão do operador, 03/08: lista
 * corrida, sem agrupar por dia — agrupar esconde repetição, que é o que se quer
 * enxergar).
 *
 * O desempate por `id` importa: vários créditos do onboarding entram no MESMO
 * `created_at` (uma transação só). Sem ele a ordem entre eles muda a cada
 * consulta e a paginação repete ou pula linha.
 */
const getEntriesByPetOwner = async (petOwnerId, { limit = 50, offset = 0 } = {}) => {
  const { rows } = await pgQuery(ENTRIES_SELECT, [
    petOwnerId,
    ACTION_LABEL_FALLBACK,
    limit,
    offset,
  ]);
  return rows;
};

const countEntriesByPetOwner = async (petOwnerId) => {
  const { rows } = await pgQuery(
    'SELECT COUNT(*)::int AS total FROM latta_coins_ledger WHERE pet_owner_id = $1',
    [petOwnerId],
  );
  return rows[0]?.total ?? 0;
};

/**
 * O saldo MATERIALIZADO. Pode não existir (tutor que nunca pontuou) e pode
 * mentir (é snapshot de uma soma que vive noutro lugar) — as duas coisas são
 * tratadas pelo service, não escondidas aqui.
 */
const getBalanceByPetOwner = async (petOwnerId) => {
  const { rows } = await pgQuery(
    `SELECT pet_owner_id, total_coins, coins_cashback, coins_engagement, updated_at
       FROM latta_coins_balance
      WHERE pet_owner_id = $1`,
    [petOwnerId],
  );
  return rows[0] ?? null;
};

/**
 * A soma que o `latta_coins_balance` DEVERIA refletir.
 *
 * Só `available` entra, que é a definição usada pelo próprio balance. `pending`
 * e `cancelled` viajam nas entries pra serem vistos, mas somá-los faria todo
 * tutor com pendência aparecer como divergente — e um alarme que toca sempre
 * treina o olho a ignorar.
 */
const getAvailableSumByPetOwner = async (petOwnerId) => {
  const { rows } = await pgQuery(
    `SELECT COALESCE(SUM(coins_earned), 0)::int AS sum
       FROM latta_coins_ledger
      WHERE pet_owner_id = $1 AND status = 'available'`,
    [petOwnerId],
  );
  return rows[0]?.sum ?? 0;
};

const petOwnerExists = async (petOwnerId) => {
  const { rows } = await pgQuery('SELECT 1 FROM pet_owners WHERE id = $1', [petOwnerId]);
  return rows.length > 0;
};

/**
 * Crédito duplicado: a assinatura de um retry que creditou duas vezes.
 *
 * 🚨 O agrupamento inclui `pet_owner_id`, e isso NÃO é detalhe. A primeira
 * versão desta regra agrupava só por (`action_key`, `reference_id`) — medindo
 * contra prod, ela acusava 16 "duplicados" de `admin_grant` que eram **16
 * tutores diferentes** com o mesmo `reference_id` de CAMPANHA
 * (`entry_floor_60_2026_07_22`), e 3 de `streak_milestone_7d` com o literal
 * `streak_7`.
 *
 * Ou seja: `reference_id` nem sempre identifica uma transação — às vezes é
 * rótulo de lote. Duplicidade só existe DENTRO do mesmo tutor.
 *
 * Medido em 03/08 com a regra correta: zero duplicados em 485 lançamentos.
 */
const getDuplicateGroupsByPetOwner = async (petOwnerId) => {
  const { rows } = await pgQuery(
    `SELECT
       l.action_key,
       COALESCE(NULLIF(a.description_pt, ''), $2) AS action_label,
       l.reference_id,
       COUNT(*)::int AS count,
       SUM(l.coins_earned)::int AS coins_total
     FROM latta_coins_ledger l
     LEFT JOIN coin_actions a ON a.action_key = l.action_key
     WHERE l.pet_owner_id = $1
       AND l.status = 'available'
       AND l.reference_id IS NOT NULL
     GROUP BY l.action_key, a.description_pt, l.reference_id
     HAVING COUNT(*) > 1
     ORDER BY COUNT(*) DESC`,
    [petOwnerId, ACTION_LABEL_FALLBACK],
  );
  return rows;
};

/**
 * Pendente que o cron devia ter liberado e não liberou.
 *
 * 🚨 A janela de 24h existe porque `available_at` no passado é ESTADO NORMAL: o
 * `Release_Pending_Coins` roda **uma vez por dia, às 03h**. Um cashback que
 * amadurece às 18h43 fica legitimamente pendente até a madrugada seguinte.
 *
 * A primeira versão da regra era `available_at < NOW()`, e medindo contra prod
 * ela acusava exatamente esse caso — um alarme que tocaria todo santo dia, pra
 * quase todo pendente. Alarme que toca sempre treina o olho a ignorar, e aí o
 * dia que aparecer o de verdade ninguém vê.
 *
 * 24h = o cron teve ao menos uma chance completa e não pegou.
 * Medido em 03/08: zero pendentes nessa situação.
 */
const STALE_PENDING_HOURS = 24;

const getStalePendingByPetOwner = async (petOwnerId) => {
  const { rows } = await pgQuery(
    `SELECT
       l.id,
       l.action_key,
       COALESCE(NULLIF(a.description_pt, ''), $2) AS action_label,
       l.coins_earned,
       l.available_at
     FROM latta_coins_ledger l
     LEFT JOIN coin_actions a ON a.action_key = l.action_key
     WHERE l.pet_owner_id = $1
       AND l.status = 'pending'
       AND l.available_at IS NOT NULL
       AND l.available_at < NOW() - ($3 || ' hours')::interval
     ORDER BY l.available_at ASC`,
    [petOwnerId, ACTION_LABEL_FALLBACK, String(STALE_PENDING_HOURS)],
  );
  return rows;
};

export default {
  ACTION_LABEL_FALLBACK,
  STALE_PENDING_HOURS,
  getDuplicateGroupsByPetOwner,
  getStalePendingByPetOwner,
  getEntriesByPetOwner,
  countEntriesByPetOwner,
  getBalanceByPetOwner,
  getAvailableSumByPetOwner,
  petOwnerExists,
};
