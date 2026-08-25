// A JANELA DE ATENDIMENTO DE 24h DO WHATSAPP — a definição do painel.
//
// ─────────────────────────────────────────────────────────────────────────────
// 🚨 ESTE ARQUIVO É A GÊMEA DE `chat-engine/lib/customer-window.ts`
//
// A regra nasceu na EF em 03/08/2026, medida contra 30 dias de
// `op:send_welcome_flow`, e desde então governa os TRÊS sinks de entrega
// (chat-engine, marketplace-service, proactive-service). O painel ficou de
// fora — e o painel é justamente onde um humano lê o número e decide mandar.
//
// Mexeu aqui, confira lá. O texto da regra é um só:
//
//     janela = último inbound com `message_type <> 'flow'`
//
// ─────────────────────────────────────────────────────────────────────────────
// 🚨 POR QUE O TIPO, E NÃO O `message_id`
//
// As duas alternativas óbvias erram, em direções OPOSTAS (medido em prod,
// 14 dias, 25/08/2026):
//
//   ❌ contar todo inbound cru — 4.316 das ~5.400 linhas de inbound são
//      `message_type='flow'`: o tutor navegando DENTRO do Flow. Isso é
//      `data_exchange` batendo no NOSSO endpoint, a Meta nunca vê, e não abre
//      janela nenhuma. É a regra que estava aqui até 25/08, e ela mentia em
//      80% do volume.
//
//   ❌ exigir `message_id` (wamid) — o TAP DE BOTÃO abre a janela (é mensagem
//      de verdade) e é logado SEM wamid. Filtrar por wamid marcaria como
//      fechada a janela de quem acabou de tocar num botão.
//
// A prova de dano das 14 falhas `wa_131047` dos últimos 30 dias: em NOVE delas
// o "último inbound" pela regra velha era uma linha de Flow, às vezes 2
// segundos antes da falha, enquanto o último inbound real era de dias atrás —
// num caso, de treze dias. O painel dizia "23h59 restantes".
//
// ─────────────────────────────────────────────────────────────────────────────
// 🚨 A SEGUNDA FONTE, E POR QUE ELA É NECESSÁRIA: O FECHAMENTO DO FLOW
//
// O `nfm_reply` — o tutor CONCLUINDO um Flow — É mensagem de verdade e renova a
// janela na Meta. Mas o Lattinha não repassa o wamid dele, e ele não vira linha
// própria no `chat_history`: vira mais uma linha `flow`, que a cláusula acima
// (corretamente) descarta. Só com o `chat_history` a conta erraria PRA FECHADO
// justamente pra quem acabou de interagir.
//
// Não é hipótese. [MEDIDO 25/08/2026] O tutor `5531993110587` tem último inbound
// no `chat_history` em 12/08 — treze dias — e concluiu um Flow HOJE às 14:25.
// Dos 35 telefones com rastro no ledger, 11 têm evento mais novo que o
// `chat_history`, e em 4 deles a janela está aberta AGORA e a conta sem o ledger
// diria fechada.
//
// A fonte é o ledger do `webhook-gateway` (`incoming_messages`), e ele é o
// registro mais honesto que a casa tem pra esta pergunta: por CONSTRUÇÃO ele
// guarda o que a Meta ENTREGOU pra gente — que é a definição literal do que
// renova a janela. Desde o flip de 21/08 toda mensagem passa por ali, e os 66
// `nfm_reply` de 5 dias estão lá com wamid.
//
// ⚠️ Ele começa em 20/08/2026 e não tem passado. Por isso as duas fontes entram
// por `GREATEST` (que no Postgres ignora NULL): o ledger só pode EMPURRAR a
// janela pra frente, e telefone anterior a ele continua respondendo pelo
// `chat_history` como sempre respondeu.

/** 24h — a customer service window do WhatsApp. */
export const CUSTOMER_WINDOW_HOURS = 24;

/**
 * O único `message_type` de inbound que NÃO abre janela: a navegação do tutor
 * dentro do Flow. É `data_exchange`, não mensagem.
 */
export const NON_WINDOW_INBOUND_TYPE = 'flow';

/**
 * O predicado SQL do inbound que conta, para quem monta query crua.
 *
 * Existe pra que ninguém reescreva a regra à mão: uma cópia com a cláusula
 * faltando é exatamente o bug que este arquivo veio consertar. `sent_by` guarda
 * 'latta' pro que sai, e 'pet owner' / 'petshop' / etc. pro que entra.
 */
export const INBOUND_ABRE_JANELA_SQL =
  `sent_by <> 'latta' AND coalesce(message_type, '') <> '${NON_WINDOW_INBOUND_TYPE}'`;

/**
 * A expressão SQL do INSTANTE do último inbound que abre janela, para um
 * telefone. As duas fontes, num `GREATEST` só.
 *
 * 🚨 Quem precisar desse instante chama daqui. Escrever a query à mão é como
 * nasceu o bug de 25/08: o painel tinha uma cópia da regra sem o filtro de
 * tipo, e ninguém percebeu porque as EFs estavam certas.
 *
 * @param {string} phoneExpr expressão SQL que rende o telefone (`:phone`, `r.raw`…)
 */
export const ultimoInboundQueAbreJanelaSql = (phoneExpr) => `
    GREATEST(
      (SELECT max(ch.timestamp)
         FROM chat_history ch
        WHERE regexp_replace(coalesce(ch.cell_phone, ''), '\\D', '', 'g')
              = public.normalize_br_phone(${phoneExpr})
          AND ${INBOUND_ABRE_JANELA_SQL}),
      (SELECT max(im.created_at)
         FROM incoming_messages im
        WHERE public.normalize_br_phone(im.phone)
              = public.normalize_br_phone(${phoneExpr}))
    )`;

/**
 * A janela está aberta, dado o instante do último inbound que conta?
 *
 * PURA — sem I/O e sem relógio implícito, pra ser testável. Mesma separação da
 * `decideWindowOpen` da EF.
 *
 * @param {Date|string|null|undefined} lastInboundAt último inbound que abre janela
 * @param {number} nowMs agora, em ms
 * @returns {{aberta: boolean, ultima_msg_tutor: Date|null, horas_desde: number|null}}
 */
export const decideJanela24h = (lastInboundAt, nowMs = Date.now()) => {
  const t = lastInboundAt ? new Date(lastInboundAt) : null;
  if (!t || Number.isNaN(t.getTime())) {
    return { aberta: false, ultima_msg_tutor: null, horas_desde: null };
  }

  const horas = (nowMs - t.getTime()) / 36e5;
  return {
    aberta: horas < CUSTOMER_WINDOW_HOURS,
    ultima_msg_tutor: t,
    // Uma casa decimal: é o que o card mostra, e arredondar aqui evita que
    // duas telas exibam "23,9h" e "24h" pro mesmo instante.
    horas_desde: Math.round(horas * 10) / 10,
  };
};
