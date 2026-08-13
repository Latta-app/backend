// qa-filter.js
// Quem é QA e quem é cliente, para as telas de admin.
//
// 🚨 A DISTINÇÃO É DE DOIS NÍVEIS, e confundi-los tem custos OPOSTOS.
//
// 1. PERSONA SINTÉTICA — número fabricado, dado que nunca existiu.
//    Ranges medidos em prod (13/08/2026):
//      5500000000XXX  personas de onboarding (`scripts/test-onboarding-personas.ts`)
//      55000000880XX  tutor do harness de agendamento
//      55000000990XX  clínica do harness de agendamento
//    O prefixo comum é `5500000` — DDD 00 não existe no Brasil, então nenhum
//    telefone real cai aqui. É o mesmo filtro que a RPC `get_scheduling_metrics`
//    já usa. Estes NUNCA aparecem: são dado inventado, e inventado num painel
//    de análise é pior que ausente.
//
//    O filtro antigo destas telas era `5500000000%` (dez caracteres) e deixava
//    passar os dois ranges do agendamento: "Lucas Moura Test" e "Íris Teste S"
//    apareciam como acionamento real, e "Iris Clinica Teste" sozinha respondia
//    por 118 das 123 tentativas somadas na `clinics`.
//
// 2. WHITELIST DE QA (`staging_users`) — GENTE REAL com número real, que usa o
//    produto para validar. Hoje é um número (o sócio). O check-in dele é um
//    check-in de verdade: 25 dias de sequência, 1.494 pontos, o topo da tabela.
//
//    Estes aparecem MARCADOS, com filtro pra esconder. Escondê-los por padrão
//    subnotificaria o uso real; mostrá-los sem marca inflaria a contagem de
//    "clientes". A própria mensageria já faz essa distinção: a BUSCA em prod
//    exclui só as sintéticas, porque a whitelist "é gente real, com conversa
//    real" (chat-history.repository.js).
//
// Fonte da verdade da whitelist é a TABELA, nunca uma lista aqui: entrar e sair
// do `staging_users` reflete sem deploy.

/** Prefixo comum a todos os ranges sintéticos. DDD 00 não existe no Brasil. */
export const SYNTHETIC_PHONE_PREFIX = '5500000';

/**
 * Recorte SQL que EXCLUI persona sintética. Vai em toda consulta destas telas,
 * sem opção de desligar.
 *
 * @param {string} column - coluna de telefone já qualificada (ex: `o.cell_phone`)
 */
export const excludeSynthetic = (column) =>
  `AND coalesce(${column},'') NOT LIKE '${SYNTHETIC_PHONE_PREFIX}%'`;

/**
 * Expressão booleana "esta linha é da whitelist de QA?", pra tela marcar e
 * filtrar. Não exclui nada — quem decide é o operador.
 */
export const isWhitelistedQa = (column) =>
  `(coalesce(${column},'') IN (SELECT phone FROM staging_users))`;

export default { SYNTHETIC_PHONE_PREFIX, excludeSynthetic, isWhitelistedQa };
