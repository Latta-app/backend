/* ============================================================================
 * A SAÍDA PRO WHATSAPP — a ida à Meta e o registro no chat_history
 * ============================================================================
 *
 * Extraído do `messaging.service.js`, que era o único lugar do backend a fazer
 * isso. Mesmo proxy, mesmo timeout, mesmo fire-and-forget do log: este arquivo
 * não muda comportamento, muda de dono.
 *
 * 🚨 POR QUE EXTRAIR EM VEZ DE COPIAR. O Destino da campanha precisa da mesma
 * ida à Meta, e cópia de caminho de envio é a pior duplicação possível desta
 * casa: a rede de recuperação de entrega (`tpl_media_sent`) depende do rastro
 * nascer em TODO sink, e já ficou 8 dias dormente porque nasceu em um só. Sink
 * novo escondido numa cópia é sink que nenhuma rede cobre.
 *
 * 🚨 E O QUE ESTE ARQUIVO NÃO CARREGA JUNTO: o `setAttendance`.
 *
 * O `sendTemplate` do painel liga `contacts.is_being_attended` depois de mandar,
 * porque ali isso é verdade — a Luma assumiu a conversa. Numa campanha é
 * desastre: o `chat-engine` CALA O BOT INTEIRO enquanto o flag estiver de pé
 * (`isBeingAttended` → `bypass_human_attendant_*`, retorna sem enviar nada), e
 * **nenhum código de produção volta esse flag pra false** — só um humano no
 * painel, conversa por conversa.
 *
 * Um disparo de 69 peças reusando aquele caminho silenciaria 69 tutores e
 * deixaria 69 atendimentos abertos pra alguém fechar na mão. Por isso o envio de
 * campanha usa este módulo, e não aquele.
 * ============================================================================ */

import axios from 'axios';

const PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID || '587778224419344';
const WHATSAPP_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN;
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://kusqorpjtadcuooprpqb.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// 🚨 Via whatsapp-proxy, e não direto no graph.facebook.com: o Docker da EC2 tem
// ECONNRESET intermitente contra a Meta, e o proxy é o contorno que já roda.
const WHATSAPP_PROXY_URL = `${SUPABASE_URL}/functions/v1/whatsapp-proxy?target=https://graph.facebook.com/v21.0/${PHONE_NUMBER_ID}/messages`;
const CHAT_HISTORY_LOGGER_URL = `${SUPABASE_URL}/functions/v1/chat-history-logger`;

export const LUMA_NAME = 'Luma';

export const callMeta = async (payload) => {
  const resp = await axios.post(WHATSAPP_PROXY_URL, payload, {
    headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}`, 'Content-Type': 'application/json' },
    timeout: 15000,
  });
  return resp.data;
};

/**
 * O registro no chat_history.
 *
 * Fire-and-forget de propósito: a mensagem já foi pra Meta, e derrubar o envio
 * porque o log falhou trocaria "a mensageria fica fora de sync por minutos" por
 * "o tutor recebeu e o sistema acha que não mandou".
 */
export const logToHistory = async (row) => {
  try {
    await axios.post(CHAT_HISTORY_LOGGER_URL, row, {
      headers: {
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
      },
      timeout: 5000,
    });
    return true;
  } catch (err) {
    console.warn('[outbound] logToHistory failed:', err?.message || err);
    return false;
  }
};

/**
 * 🚨 A MENSAGEM SAIU OU NÃO? A pergunta que decide se dá pra retentar.
 *
 * Erro em que a Meta RESPONDEU (4xx com corpo de erro) é recusa: a mensagem não
 * saiu, e retentar é seguro. Timeout e queda de conexão são outra coisa — o
 * request pode ter chegado lá e a resposta ter se perdido no caminho de volta.
 *
 * Retentar um incerto é o jeito mais fácil de mandar duas vezes. Desistir dele é
 * o jeito mais fácil de não mandar. Nenhuma das duas pode ser automática, então
 * esta função só CLASSIFICA e quem chama separa a linha pra um humano decidir.
 */
export const classificarFalha = (err) => {
  const status = err?.response?.status;
  if (status) {
    const detalhe = err.response?.data?.error?.message || err.message;
    return { incerto: false, motivo: `a Meta recusou (HTTP ${status}): ${detalhe}`.slice(0, 400) };
  }
  const codigo = err?.code || err?.name || '';
  return {
    incerto: true,
    motivo: `não deu pra saber se saiu (${codigo || err?.message || 'sem resposta'})`.slice(0, 400),
  };
};

export default { callMeta, logToHistory, classificarFalha, LUMA_NAME };
