import CoinsRepository from '../repositories/coins.repository.js';

// Painel de lattinhas — leitura + a conta que dá sentido a ele.
// Ref: docs/issues/painel-lattinhas/issues/02-* (repo Latta).

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

const EMPTY_BALANCE = {
  total_coins: 0,
  coins_cashback: 0,
  coins_engagement: 0,
  updated_at: null,
};

/**
 * A reconciliação: o saldo materializado bate com a soma do ledger?
 *
 * 🚨 Função PURA e calculada no SERVIDOR de propósito. É a conta que justifica o
 * painel inteiro; deixá-la no front convidaria duas implementações a divergirem,
 * e a que diverge silenciosamente é sempre a que ninguém olha.
 *
 * `delta > 0` = o saldo tem lattinha que o ledger não explica (o caso real medido
 * em 03/08: saldo 10, ledger vazio). `delta < 0` = o tutor lançou mais do que o
 * saldo mostra — ele está sendo lesado.
 *
 * Tutor sem linha em `latta_coins_balance` conta como saldo ZERO, não como
 * ausência: assim quem tem lançamento e nenhum saldo aparece como divergente, em
 * vez de sumir do relatório.
 */
export const reconcile = (balance, ledgerAvailableSum) => {
  const balanceTotal = Number(balance?.total_coins ?? 0);
  const ledgerSum = Number(ledgerAvailableSum ?? 0);
  const delta = balanceTotal - ledgerSum;
  return {
    ledger_available_sum: ledgerSum,
    balance_total: balanceTotal,
    delta,
    matches: delta === 0,
  };
};

/**
 * O que está ERRADO com este tutor — a parte que separa instrumento de vitrine.
 *
 * Sem isto, o painel entrega um extrato bonito que exige o operador somar de
 * cabeça pra descobrir que algo não fecha. E ninguém soma.
 *
 * 🚨 `has_any` false = **nenhum aviso na tela**. Nem um "tudo certo ✓" verde:
 * ruído constante treina o olho a ignorar, e aí o dia que aparecer vermelho
 * ninguém vê. As duas regras abaixo já nasceram calibradas por medição contra
 * prod justamente pra não tocar à toa (ver comentários no repository).
 *
 * Descreve, nunca corrige. Ajustar saldo é decisão com dono, em issue própria,
 * depois de medir quantos tutores estão nessa situação.
 */
export const buildAnomalies = (reconciliation, duplicates, stalePending) => {
  const balanceMismatch = reconciliation?.matches === false
    ? { delta: reconciliation.delta }
    : null;
  const dup = duplicates ?? [];
  const stale = stalePending ?? [];
  return {
    balance_mismatch: balanceMismatch,
    duplicates: dup,
    stale_pending: stale,
    has_any: Boolean(balanceMismatch) || dup.length > 0 || stale.length > 0,
  };
};

/** `limit`/`offset` do cliente nunca entram crus na query. */
export const normalizePaging = ({ limit, offset } = {}) => {
  const parsedLimit = Number.parseInt(limit, 10);
  const parsedOffset = Number.parseInt(offset, 10);
  return {
    limit: Number.isFinite(parsedLimit) && parsedLimit > 0
      ? Math.min(parsedLimit, MAX_LIMIT)
      : DEFAULT_LIMIT,
    offset: Number.isFinite(parsedOffset) && parsedOffset > 0 ? parsedOffset : 0,
  };
};

/**
 * O extrato do tutor: saldo, lançamentos e a divergência entre os dois.
 *
 * Lança `{ status: 404 }` só quando o TUTOR não existe. Tutor que existe e nunca
 * pontuou devolve 200 com `entries: []` — o painel precisa distinguir "não ganhou
 * nada" de "deu erro", e devolver 404 aí faria a tela mostrar falha pra um estado
 * perfeitamente normal.
 */
const getByPetOwner = async (petOwnerId, paging) => {
  const exists = await CoinsRepository.petOwnerExists(petOwnerId);
  if (!exists) {
    const err = new Error('pet_owner não encontrado');
    err.status = 404;
    throw err;
  }

  const { limit, offset } = normalizePaging(paging);

  const [balanceRow, entries, total, availableSum, duplicates, stalePending] = await Promise.all([
    CoinsRepository.getBalanceByPetOwner(petOwnerId),
    CoinsRepository.getEntriesByPetOwner(petOwnerId, { limit, offset }),
    CoinsRepository.countEntriesByPetOwner(petOwnerId),
    CoinsRepository.getAvailableSumByPetOwner(petOwnerId),
    CoinsRepository.getDuplicateGroupsByPetOwner(petOwnerId),
    CoinsRepository.getStalePendingByPetOwner(petOwnerId),
  ]);

  const reconciliation = reconcile(balanceRow, availableSum);

  return {
    // Sem linha de saldo devolve zeros, não `null`: a tela não deveria precisar
    // de um caminho especial pra um tutor que só ainda não pontuou.
    balance: balanceRow
      ? {
        total_coins: balanceRow.total_coins,
        coins_cashback: balanceRow.coins_cashback,
        coins_engagement: balanceRow.coins_engagement,
        updated_at: balanceRow.updated_at,
      }
      : { ...EMPTY_BALANCE },
    entries,
    // 🚨 A reconciliação usa a soma da BASE INTEIRA, não a da página. Somar a
    // página faria todo tutor com mais de 50 lançamentos aparecer divergente.
    reconciliation,
    // Idem: anomalia é da base inteira. Um duplicado na página 3 continua sendo
    // um duplicado quando o operador está olhando a página 1.
    anomalies: buildAnomalies(reconciliation, duplicates, stalePending),
    page: { limit, offset, total },
  };
};

export default { getByPetOwner, reconcile, normalizePaging, buildAnomalies };
