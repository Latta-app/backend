import { Stagehand } from '@browserbasehq/stagehand';
import crypto from 'crypto';

const runDownload = async (url) => {
  console.log('🚀 [service] Iniciando Stagehand para baixar imagem...');
  let stagehand = null;

  try {
    const useCloud = process.env.USE_BROWSERBASE === 'true';
    stagehand = new Stagehand({
      env: useCloud ? 'BROWSERBASE' : 'LOCAL',
      apiKey: process.env.BROWSERBASE_API_KEY,
      projectId: process.env.BROWSERBASE_PROJECT_ID,
    });

    await stagehand.init();
    const page = stagehand.page;

    console.log('🌐 [service] Acessando URL:', url);
    await page.goto('about:blank'); // limpa contexto
    await page.goto(url, { waitUntil: 'domcontentloaded' });

    console.log('📥 [service] Baixando imagem via fetch no contexto do navegador...');

    const base64 = await page.evaluate(async (imageUrl) => {
      const response = await fetch(imageUrl);
      const arrayBuffer = await response.arrayBuffer();
      const binary = Array.from(new Uint8Array(arrayBuffer))
        .map((b) => String.fromCharCode(b))
        .join('');
      return btoa(binary);
    }, url);

    await stagehand.close();

    console.log('✅ [service] Download finalizado com sucesso.');
    return {
      imageBase64: base64,
      mimeType: 'image/jpeg',
    };
  } catch (err) {
    if (stagehand) await stagehand.close();
    console.error('❌ [service] Erro no Stagehand:', err);
    throw err;
  }
};

function getPrivateKey() {
  const raw = process.env.WHATSAPP_PRIVATE_KEY || '';
  const b64 = process.env.WHATSAPP_PRIVATE_KEY_B64 || '';

  if (b64) return Buffer.from(b64, 'base64').toString('utf8');
  if (!raw) throw new Error('WHATSAPP_PRIVATE_KEY não configurada');
  return raw.replace(/\\n/g, '\n');
}

function decryptFlowPayload({ encrypted_flow_data, encrypted_aes_key, initial_vector }) {
  const PRIVATE_KEY = getPrivateKey();

  const aesKey = crypto.privateDecrypt(
    {
      key: PRIVATE_KEY,
      padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
      oaepHash: 'sha256',
    },
    Buffer.from(encrypted_aes_key, 'base64'),
  );

  const algByLen = { 16: 'aes-128-cbc', 24: 'aes-192-cbc', 32: 'aes-256-cbc' };
  const aesAlg = algByLen[aesKey.length];
  if (!aesAlg) throw new Error(`Tamanho da chave AES inesperado: ${aesKey.length}`);

  const iv = Buffer.from(initial_vector, 'base64');
  const decipher = crypto.createDecipheriv(aesAlg, aesKey, iv);
  let decrypted = decipher.update(encrypted_flow_data, 'base64', 'utf8');
  decrypted += decipher.final('utf8');

  let data;
  try {
    data = JSON.parse(decrypted);
  } catch {
    data = { raw: decrypted };
  }

  return { data, aesKey, iv, aesAlg };
}

function encryptFlowResponse({ responseObject, aesKey, iv, aesAlg }) {
  const cipher = crypto.createCipheriv(aesAlg, aesKey, iv);
  let enc = cipher.update(JSON.stringify(responseObject), 'utf8', 'base64');
  enc += cipher.final('base64');
  return enc;
}

export default { runDownload, decryptFlowPayload, encryptFlowResponse };
