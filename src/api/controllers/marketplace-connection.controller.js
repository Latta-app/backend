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

// POST /marketplace-connection/:phone/send-code  { channel: 'sms' | 'wpp' }
// Dispara o código de ativação da Petz pelo canal escolhido.
const sendCode = async (req, res) => {
  const { phone } = req.params;
  const { channel } = req.body || {};

  if (!isValidPhone(phone)) {
    return res.status(400).json({ code: 'INVALID_DATA', message: 'telefone inválido' });
  }
  if (channel !== 'sms' && channel !== 'wpp') {
    return res
      .status(400)
      .json({ code: 'INVALID_DATA', message: "channel deve ser 'sms' ou 'wpp'" });
  }

  try {
    const result = await MarketplaceConnectionService.sendCode({
      phone: String(phone).replace(/\D/g, ''),
      channel,
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
