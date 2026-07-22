// Controller da conexão do tutor com os marketplaces parceiros (hoje só Petz),
// consumido pelo painel da mensageria.

import MarketplaceConnectionService from '../services/marketplace-connection.service.js';

const isValidPhone = (phone) => {
  const digits = String(phone || '').replace(/\D/g, '');
  return digits.length >= 12 && digits.length <= 13;
};

// GET /marketplace-connection/:phone
// -> { success, connection: { provider, estado, conectada, connected_at, last_ok_at, ... } }
const getConnection = async (req, res) => {
  const { phone } = req.params;
  if (!isValidPhone(phone)) {
    return res.status(400).json({ code: 'INVALID_DATA', message: 'telefone inválido' });
  }

  try {
    const connection = await MarketplaceConnectionService.getConnection(
      String(phone).replace(/\D/g, ''),
    );
    return res.status(200).json({ success: true, connection });
  } catch (err) {
    console.error('[marketplace-connection] getConnection:', err.message);
    return res
      .status(500)
      .json({ success: false, code: 'CONNECTION_LOOKUP_ERROR', message: err.message });
  }
};

// Teto da mensagem do operador. Mesmo número no frontend (contador) e na EF
// (corte final) — aqui é onde ele vira recusa, porque é o limite que o cliente
// não controla.
const MSG_MAX = 1000;

// POST /marketplace-connection/:phone/send-code  { channel: 'sms' | 'wpp', message? }
// Dispara o código de ativação da Petz pelo canal escolhido. `message` é o texto
// que o operador escreveu no painel; vazio cai na copy padrão da Latta.
const sendCode = async (req, res) => {
  const { phone } = req.params;
  const { channel, message } = req.body || {};

  if (!isValidPhone(phone)) {
    return res.status(400).json({ code: 'INVALID_DATA', message: 'telefone inválido' });
  }
  if (channel !== 'sms' && channel !== 'wpp') {
    return res
      .status(400)
      .json({ code: 'INVALID_DATA', message: "channel deve ser 'sms' ou 'wpp'" });
  }
  if (message !== undefined && typeof message !== 'string') {
    return res.status(400).json({ code: 'INVALID_DATA', message: 'message deve ser texto' });
  }
  if (typeof message === 'string' && message.length > MSG_MAX) {
    return res
      .status(400)
      .json({ code: 'INVALID_DATA', message: `message passa de ${MSG_MAX} caracteres` });
  }

  try {
    const result = await MarketplaceConnectionService.sendCode({
      phone: String(phone).replace(/\D/g, ''),
      channel,
      // Só espaços é o mesmo que vazio: cai na copy padrão em vez de mandar
      // uma mensagem em branco pro tutor.
      message: typeof message === 'string' ? message.trim() : '',
    });
    // success:false aqui é caso ESPERADO (ex: tutor sem CPF guardado). Vai como
    // 200 com a mensagem pronta — o painel mostra o motivo em vez de "erro".
    return res.status(200).json(result);
  } catch (err) {
    console.error('[marketplace-connection] sendCode:', err.message);
    return res
      .status(err.status || 500)
      .json({ success: false, code: 'SEND_CODE_ERROR', message: err.message });
  }
};

export default { getConnection, sendCode };
