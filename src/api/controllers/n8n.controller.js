import path from 'path';
import { fork } from 'child_process';
import n8nService from '../services/n8n.service.js';

const downloadImage = async (req, res) => {
  console.log('==============================');
  console.log('🧩 [controller] Iniciando download da imagem via worker');
  console.log('==============================');

  const { url } = req.body;
  if (!url) {
    return res.status(400).json({
      code: 'INVALID_URL',
      message: 'Envie o campo "url" no corpo da requisição',
    });
  }

  try {
    const workerPath = path.resolve('src/api/workers/download-image-runner.js');
    console.log('👷 [controller] Iniciando processo filho:', workerPath);

    const child = fork(workerPath, [JSON.stringify({ url })], {
      silent: true,
      stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
    });

    child.stdout.on('data', (d) => process.stdout.write(`[worker] ${d}`));
    child.stderr.on('data', (d) => process.stderr.write(`[worker-err] ${d}`));

    const resultPromise = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('TIMEOUT')), 60000);

      child.on('message', (msg) => {
        clearTimeout(timeout);
        if (msg.status === 'success') resolve(msg);
        else reject(new Error(msg.message || 'Erro no worker'));
      });

      child.on('exit', (code) => {
        if (code !== 0) reject(new Error(`Worker encerrou com código ${code}`));
      });
    });

    const result = await resultPromise;

    console.log('✅ [controller] Download concluído.');
    res.status(200).json({
      success: true,
      imageBase64: result.imageBase64,
      mimeType: result.mimeType,
    });
  } catch (err) {
    console.error('❌ [controller] Erro no download:', err);
    res.status(500).json({
      code: 'DOWNLOAD_ERROR',
      message: 'Erro ao baixar imagem',
      error: err.message,
    });
  }
};

const whatsappFlow = async (req, res) => {
  try {
    const { encrypted_flow_data, encrypted_aes_key, initial_vector } = req.body;
    const { decryptFlowPayload, encryptFlowResponse } = n8nService;

    if (!encrypted_flow_data || !encrypted_aes_key || !initial_vector) {
      return res.status(400).json({ error: 'Campos obrigatórios ausentes.' });
    }

    const { data, aesKey, iv, aesAlg } = decryptFlowPayload({
      encrypted_flow_data,
      encrypted_aes_key,
      initial_vector,
    });

    console.log('📩 Flow recebido do WhatsApp:', data);

    // sua lógica de negócio:
    const responseObject = { status: 'ok', received: data };

    const encrypted_response_data = encryptFlowResponse({
      responseObject,
      aesKey,
      iv,
      aesAlg,
    });

    return res.json({ encrypted_response_data });
  } catch (err) {
    console.error('❌ Erro no whatsappFlow:', err);
    return res.status(400).json({ error: err.message });
  }
};

export default { downloadImage, whatsappFlow };
