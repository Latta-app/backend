// marketplace-connection.service.js
//
// Estado da conexão do tutor com os marketplaces parceiros (hoje só a Petz) +
// reenvio manual do código de ativação pelo painel da mensageria.
//
// Contexto: até aqui o admin não tinha NENHUMA referência a petz_accounts —
// o operador não conseguia ver se a conexão deu certo, nem agir quando não
// deu. Ver docs/issues/petz-conexao-observabilidade-resgate/PROPOSTA.md.
//
// Leitura: RPC get_petz_connection (não devolve CPF nem token).
// Escrita: operação petz_force_connect da EF chat-engine — de propósito, e NÃO
// a petz_resend_sms do marketplace-service: só o caminho da chat-engine ARMA A
// PENDÊNCIA no Redis, sem a qual o tutor responde os 6 dígitos e ninguém
// captura (PROPOSTA.md §3.3, armadilha 1).

import { Sequelize } from 'sequelize';
import { sequelize } from '../../config/database.js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const CHAT_ENGINE_URL = `${SUPABASE_URL}/functions/v1/chat-engine`;

/** Janela de mensagem livre do WhatsApp: 24h desde a última mensagem do tutor. */
const WHATSAPP_WINDOW_HOURS = 24;

/**
 * Janela de mensagem livre do WhatsApp: 24h desde a última mensagem DO TUTOR.
 *
 * Uma definição só, usada pelo card (que mostra o estado) e pelo envio (que
 * decide entre texto livre e template). Duplicar essa conta em dois lugares é
 * como o painel passaria a prometer algo que o disparo não cumpre.
 */
const janela24h = async (phone) => {
  const [win] = await sequelize.query(
    `
    SELECT MAX(timestamp) AS last_inbound
    FROM chat_history
    WHERE regexp_replace(coalesce(cell_phone, ''), '\\D', '', 'g')
          = public.normalize_br_phone(:phone)
      AND sent_by <> 'latta'
    `,
    { replacements: { phone }, type: Sequelize.QueryTypes.SELECT },
  );

  const lastInbound = win?.last_inbound ? new Date(win.last_inbound) : null;
  const hoursSince = lastInbound ? (Date.now() - lastInbound.getTime()) / 36e5 : null;

  return {
    aberta: hoursSince !== null && hoursSince < WHATSAPP_WINDOW_HOURS,
    ultima_msg_tutor: lastInbound,
    horas_desde: hoursSince === null ? null : Math.round(hoursSince * 10) / 10,
  };
};

/**
 * Estado da conexão + contexto que o operador precisa pra decidir agir.
 * @param {string} phone telefone do tutor (aceita 12 ou 13 dígitos)
 */
export const getConnection = async (phone) => {
  const [row] = await sequelize.query(
    `SELECT public.get_petz_connection(:phone) AS conn`,
    { replacements: { phone }, type: Sequelize.QueryTypes.SELECT },
  );

  const conn = row?.conn || { provider: 'petz', estado: 'nunca_conectou', conectada: false };

  // Fora da janela o WhatsApp não entrega texto livre — o template de reconexão
  // é que reabre a conversa antes do código.
  return { ...conn, janela_24h: await janela24h(phone) };
};

/**
 * Força o reenvio do código de ativação pelo canal escolhido.
 *
 * `message` é o texto que o operador escreveu no painel. Vazio (ou fora da
 * janela de 24h) cai na copy padrão / no template de reconexão — quem decide
 * isso é a EF, que é quem sabe o estado da janela na hora do disparo.
 *
 * @param {{phone: string, channel: 'sms'|'wpp', message?: string}} params
 */
export const sendCode = async ({ phone, channel, message }) => {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('SUPABASE env vars ausentes — chamada à EF abortada');
  }

  // Texto livre do operador só sai com a janela aberta. Fora dela a Meta recusa
  // qualquer coisa que não seja template, e o caminho correto é o template de
  // reconexão — então a mensagem é DESCARTADA aqui, e o operador é avisado disso
  // na resposta em vez de achar que o tutor leu o que ele escreveu.
  let texto = (message || '').trim();
  let aviso = null;
  if (texto) {
    const janela = await janela24h(phone);
    if (!janela.aberta) {
      texto = '';
      aviso =
        'A janela de 24h fechou, então sua mensagem não foi enviada — o tutor recebeu o template de reconexão. Assim que ele responder, dá pra escrever livremente.';
    }
  }

  const res = await fetch(CHAT_ENGINE_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      operation: 'petz_force_connect',
      phone,
      channel,
      ...(texto ? { message: texto } : {}),
    }),
  });

  const body = await res.json().catch(() => null);

  if (!res.ok) {
    const err = new Error(body?.error || `chat-engine retornou ${res.status}`);
    err.status = res.status;
    throw err;
  }

  // A EF responde 200 com success:false em casos esperados (ex: tutor sem CPF).
  // Repassa a mensagem pronta pro operador em vez de virar erro genérico.
  return {
    success: !!body?.success,
    error: body?.error || null,
    message: body?.message || body?.data?.message || null,
    channel: body?.data?.channel || channel,
    // Campo próprio: o envio deu certo E ainda assim há algo que o operador
    // precisa saber (a mensagem dele não foi). Enfiar isso em `message` faria
    // parecer erro; omitir faria ele achar que o tutor leu o que escreveu.
    aviso,
    // Eco do que realmente saiu, pro painel não afirmar o que não aconteceu.
    mensagem_enviada: !!texto,
  };
};

export default { getConnection, sendCode };
