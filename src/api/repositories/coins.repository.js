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
    l.available_at
  FROM latta_coins_ledger l
  LEFT JOIN coin_actions a ON a.action_key = l.action_key
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

export default {
  ACTION_LABEL_FALLBACK,
  getEntriesByPetOwner,
  countEntriesByPetOwner,
  getBalanceByPetOwner,
  getAvailableSumByPetOwner,
  petOwnerExists,
};
