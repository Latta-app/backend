import n8nService from '../services/n8n.service.js';

const decryptWhatsAppFlow = async (req, res) => {
  try {
    console.log('[decryptWhatsAppFlow] Body recebido:', JSON.stringify(req.body, null, 2));

    const { encrypted_flow_data, encrypted_aes_key, initial_vector } = req.body;
    const { decryptFlowPayload, encryptFlowResponse } = n8nService;

    if (!encrypted_flow_data || !encrypted_aes_key || !initial_vector) {
      console.log('[decryptWhatsAppFlow] Campos obrigatórios ausentes');
      return res.status(400).json({ error: 'Campos obrigatórios ausentes' });
    }

    console.log('[decryptWhatsAppFlow] Descriptografando payload');
    const { data, aesKey, iv, aesAlg } = decryptFlowPayload({
      encrypted_flow_data,
      encrypted_aes_key,
      initial_vector,
    });

    console.log('[decryptWhatsAppFlow] Payload descriptografado:', JSON.stringify(data, null, 2));
    console.log('[decryptWhatsAppFlow] Ação:', data.action);

    if (data.action === 'ping') {
      console.log('[decryptWhatsAppFlow] Health check detectado - respondendo automaticamente');

      const responseObject = {
        data: {
          status: 'active',
        },
      };

      const encrypted_response = encryptFlowResponse({
        responseObject,
        aesKey,
        iv,
        aesAlg,
      });

      console.log('[decryptWhatsAppFlow] Health check respondido');
      res.setHeader('Content-Type', 'text/plain');
      return res.send({ ping: encrypted_response });
    }

    console.log('[decryptWhatsAppFlow] Enviando dados descriptografados para n8n');

    return res.status(200).json({
      decrypted_data: data,
      screen: data.screen,
      crypto_params: {
        aes_key: aesKey.toString('base64'),
        iv: iv.toString('base64'),
        algorithm: aesAlg,
      },
    });
  } catch (err) {
    console.error('[decryptWhatsAppFlow] Erro:', err.message);
    console.error('[decryptWhatsAppFlow] Stack:', err.stack);
    return res.status(500).json({ error: err.message });
  }
};

const encryptWhatsAppResponse = async (req, res) => {
  try {
    console.log('[decryptMedia] Body recebido:', JSON.stringify(req.body, null, 2));

    const { response_object, crypto_params } = req.body;

    if (!response_object || !crypto_params) {
      console.log('[encryptWhatsAppResponse] Campos obrigatórios ausentes');
      return res.status(400).json({
        error: 'response_object e crypto_params são obrigatórios',
      });
    }

    console.log(
      '[encryptWhatsAppResponse] Response object:',
      JSON.stringify(response_object, null, 2),
    );
    console.log('[encryptWhatsAppResponse] Crypto params:', JSON.stringify(crypto_params, null, 2));

    const { aes_key, iv, algorithm } = crypto_params;

    if (!aes_key || !iv || !algorithm) {
      console.log('[encryptWhatsAppResponse] crypto_params incompleto');
      return res.status(400).json({
        error: 'crypto_params deve ter: aes_key, iv e algorithm',
      });
    }

    const { encryptFlowResponse } = n8nService;

    const aesKeyBuffer = Buffer.from(aes_key, 'base64');
    const ivBuffer = Buffer.from(iv, 'base64');

    console.log('[encryptWhatsAppResponse] Criptografando resposta');

    const encrypted = encryptFlowResponse({
      responseObject: response_object,
      aesKey: aesKeyBuffer,
      iv: ivBuffer,
      aesAlg: algorithm,
    });

    console.log('[encryptWhatsAppResponse] Criptografia concluída');
    console.log('[encryptWhatsAppResponse] Tamanho:', encrypted.length, 'caracteres');

    res.setHeader('Content-Type', 'text/plain');
    return res.send(encrypted);
  } catch (err) {
    console.error('[encryptWhatsAppResponse] Erro:', err.message);
    console.error('[encryptWhatsAppResponse] Stack:', err.stack);
    return res.status(500).json({ error: err.message });
  }
};

const decryptMedia = async (req, res) => {
  try {
    console.log('[decryptMedia] Nova requisição recebida');
    console.log('[decryptMedia] Body recebido:', JSON.stringify(req.body, null, 2));

    const pet_photo =
      (Array.isArray(req.body) && req.body) ||
      req.body.pet_photo ||
      (req.body.data && req.body.data.pet_photo) ||
      [];

    if (!pet_photo || !Array.isArray(pet_photo) || pet_photo.length === 0) {
      console.log('[decryptMedia] Campo pet_photo ausente ou inválido');
      return res.status(400).json({
        error:
          'Campo "pet_photo" é obrigatório (direto, dentro de data ou enviado como array) e deve ser um array com pelo menos um item',
      });
    }

    const { cdn_url, encryption_metadata, file_name } = pet_photo[0];

    if (!cdn_url || !encryption_metadata) {
      console.log('[decryptMedia] Campos obrigatórios ausentes dentro de pet_photo');
      return res.status(400).json({
        error: 'cdn_url e encryption_metadata são obrigatórios dentro de pet_photo',
      });
    }

    console.log(`[decryptMedia] Iniciando descriptografia da mídia: ${file_name}`);
    const decryptedFile = await n8nService.decryptMedia({
      cdn_url,
      encryption_metadata,
      file_name,
    });

    console.log('[decryptMedia] Mídia descriptografada com sucesso');

    return res.json({
      success: true,
      file_name,
      mime_type: decryptedFile.mimeType,
      base64: decryptedFile.base64,
    });
  } catch (err) {
    console.error('[decryptMedia] Erro:', err.message);
    console.error('[decryptMedia] Stack:', err.stack);
    return res.status(500).json({ error: err.message });
  }
};


export default {
  decryptWhatsAppFlow,
  encryptWhatsAppResponse,
  decryptMedia,
};
