/* ============================================================================
 * ESTÚDIO DE FLOWS — a SIMULAÇÃO por número (decisões PURAS)
 * ============================================================================
 *
 * O painel pede uma tela "como" um número escolhido (o operador, a Clara, um
 * cliente, um cliente novo) e a EF de Flow atende pelo caminho de produção,
 * com uma trava que impede qualquer gravação. A trava e a porta moram nas EFs
 * (repo Latta, `supabase/functions/_shared/estudio-*.ts`); aqui só se decide
 * PRA QUAL EF vai, com que `flow_token`, e se o pedido está bem formado.
 *
 * 🚨 O `flow_token` NÃO é id opaco. O telefone é o ÚLTIMO segmento, e o braço
 * do onboarding sai do FORMATO (`ONBOARDING_<ms>_<tel>` = braço A,
 * `ONBOARDING_B_<ms>_<tel>` = braço B). Um `<ms>` novo começa uma jornada nova;
 * o mesmo token ao longo da sessão é o que dá continuidade de um passo ao outro.
 * ============================================================================ */

export const EF_POR_FLOW = {
  'flow-features': 'marketplace-service',
  'flow-onboarding-v2': 'onboarding-service',
  'flow-onboarding-v2b': 'onboarding-service',
};

const PREFIXO_DO_TOKEN = {
  'flow-features': 'MARKETPLACE',
  'flow-onboarding-v2': 'ONBOARDING',
  'flow-onboarding-v2b': 'ONBOARDING_B',
};

export const MODOS = ['leitura', 'teste'];
export const ACOES = ['INIT', 'data_exchange', 'BACK'];
const SIM_ID = /^[A-Za-z0-9-]{8,64}$/;
const TELEFONE = /^55\d{10,11}$/;

/** Token novo pro par Flow × telefone. `agora` em ms. */
export const tokenNovo = (flowKey, phone, agora) =>
  `${PREFIXO_DO_TOKEN[flowKey]}_${agora}_${phone}`;

/** Um token que o painel devolveu serve se é DESTE Flow e DESTE telefone. */
export const tokenServe = (flowKey, phone, token) => {
  if (typeof token !== 'string') return false;
  const prefixo = PREFIXO_DO_TOKEN[flowKey];
  const m = token.match(/^(.+)_(\d+)_(\d+)$/);
  return Boolean(m && m[1] === prefixo && m[3] === phone);
};

const erro = (campo, mensagem) => ({ ok: false, campo, mensagem });

/**
 * Valida e monta o que vai pra EF. Devolve `{ ok, ef, modo, flowToken, corpo }`
 * ou `{ ok: false, campo, mensagem }`.
 */
export const montarSimulacao = (corpo, agora = Date.now()) => {
  if (!corpo || typeof corpo !== 'object') return erro('corpo', 'corpo ausente');
  const { flowKey, phone, modo, simId, flowToken, pedido } = corpo;

  if (!EF_POR_FLOW[flowKey]) {
    return erro(
      'flowKey',
      `o Flow "${flowKey}" ainda não tem simulação (só e-commerce e onboarding)`,
    );
  }
  const tel = String(phone || '').replace(/\D/g, '');
  if (!TELEFONE.test(tel)) return erro('phone', 'telefone precisa ser 55 + DDD + número');
  if (!MODOS.includes(modo)) return erro('modo', 'modo precisa ser "leitura" ou "teste"');
  if (typeof simId !== 'string' || !SIM_ID.test(simId)) return erro('simId', 'simId inválido');
  if (!pedido || typeof pedido !== 'object' || Array.isArray(pedido)) {
    return erro('pedido', 'pedido ausente');
  }
  if (!ACOES.includes(pedido.action)) {
    return erro('pedido.action', `ação precisa ser ${ACOES.join(', ')}`);
  }
  if (pedido.action !== 'INIT' && (typeof pedido.screen !== 'string' || !pedido.screen)) {
    return erro('pedido.screen', 'ação de tela precisa dizer de qual tela veio');
  }
  if (
    pedido.data !== undefined &&
    (typeof pedido.data !== 'object' || Array.isArray(pedido.data))
  ) {
    return erro('pedido.data', 'data precisa ser objeto');
  }

  const token = tokenServe(flowKey, tel, flowToken) ? flowToken : tokenNovo(flowKey, tel, agora);
  return {
    ok: true,
    ef: EF_POR_FLOW[flowKey],
    modo,
    flowToken: token,
    corpo: {
      simId,
      pedido: {
        version: '3.0',
        action: pedido.action,
        ...(pedido.screen ? { screen: pedido.screen } : {}),
        data: pedido.data || {},
        flow_token: token,
      },
    },
  };
};
