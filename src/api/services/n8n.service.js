  import crypto from 'crypto';

  /* ============================================================
  * 🔐 1. OBTÉM CHAVE PRIVADA DO .env
  * ============================================================ */
  function getPrivateKey() {
    const raw = process.env.WHATSAPP_PRIVATE_KEY || '';
    const b64 = process.env.WHATSAPP_PRIVATE_KEY_B64 || '';

    if (b64) return Buffer.from(b64, 'base64').toString('utf8');
    if (!raw) throw new Error('WHATSAPP_PRIVATE_KEY não configurada');

    // substitui \n literais por quebras de linha reais
    return raw.replace(/\\n/g, '\n');
  }

  /* ============================================================
  * 🧩 2. DESCRIPTOGRAFIA DO PAYLOAD DO WHATSAPP FLOW
  * ============================================================ */
  function decryptFlowPayload({ encrypted_flow_data, encrypted_aes_key, initial_vector }) {
    console.log('📦 [decryptFlowPayload] Iniciando descriptografia...');
    const PRIVATE_KEY = getPrivateKey();

    // 1️⃣ Descriptografa AES key com RSA OAEP
    const aesKey = crypto.privateDecrypt(
      {
        key: PRIVATE_KEY,
        padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
        oaepHash: 'sha256',
      },
      Buffer.from(encrypted_aes_key, 'base64'),
    );

    console.log('🔑 AES key length:', aesKey.length, 'bytes');
    const iv = Buffer.from(initial_vector, 'base64');
    const encryptedBuffer = Buffer.from(encrypted_flow_data, 'base64');

    // 2️⃣ Primeira tentativa: modo CBC (padrão documentado)
    try {
      console.log('🧩 Tentando descriptografar com AES-128-CBC...');
      const decipher = crypto.createDecipheriv('aes-128-cbc', aesKey, iv);
      let decrypted = decipher.update(encryptedBuffer, undefined, 'utf8');
      decrypted += decipher.final('utf8');

      const data = JSON.parse(decrypted);
      console.log('✅ Descriptografia bem-sucedida com modo CBC');
      return { data, aesKey, iv, aesAlg: 'aes-128-cbc' };
    } catch (cbcErr) {
      console.warn('⚠️ Falhou no modo CBC:', cbcErr.message);
    }

    // 3️⃣ Segunda tentativa: modo GCM (com ou sem tag)
    try {
      console.log('🧩 Tentando descriptografar com AES-128-GCM...');
      const decipher = crypto.createDecipheriv('aes-128-gcm', aesKey, iv);

      // Caso exista tag no fim do buffer (últimos 16 bytes)
      if (encryptedBuffer.length > 16) {
        const tag = encryptedBuffer.subarray(encryptedBuffer.length - 16);
        decipher.setAuthTag(tag);
      }

      const ciphertext = encryptedBuffer.subarray(0, encryptedBuffer.length - 16);
      let decrypted = decipher.update(ciphertext, undefined, 'utf8');
      decrypted += decipher.final('utf8');

      const data = JSON.parse(decrypted);
      console.log('✅ Descriptografia bem-sucedida com modo GCM');
      return { data, aesKey, iv, aesAlg: 'aes-128-gcm' };
    } catch (gcmErr) {
      console.error('❌ Falha total na descriptografia (CBC e GCM):', gcmErr.message);
      throw new Error('Falha ao descriptografar payload AES');
    }
  }

  /* ============================================================
  * 🔒 3. ENCRIPTA A RESPOSTA PARA O WHATSAPP FLOW
  * ============================================================ */
  function encryptFlowResponse({ responseObject, aesKey, iv, aesAlg }) {
    console.log('\n🔐 [encryptFlowResponse] INICIANDO CRIPTOGRAFIA');
    console.log('📋 Algoritmo:', aesAlg);
    console.log('🔑 AES Key (hex):', aesKey.toString('hex'));
    console.log('🎲 IV original (hex):', iv.toString('hex'));

    const jsonString = JSON.stringify(responseObject);
    console.log('📄 JSON que será criptografado:', jsonString);

    if (aesAlg.endsWith('-gcm')) {
      // ✅ INVERTER TODOS OS BITS DO IV (conforme documentação Meta)
      const flippedIV = Buffer.alloc(iv.length);
      for (let i = 0; i < iv.length; i++) {
        flippedIV[i] = ~iv[i];
      }

      console.log('🔄 IV invertido (hex):', flippedIV.toString('hex'));
      console.log('   ⚙️ Usando modo GCM com IV invertido');

      // Criptografa usando o IV invertido
      const cipher = crypto.createCipheriv(aesAlg, aesKey, flippedIV);

      const encrypted = cipher.update(jsonString, 'utf8');
      const final = cipher.final();
      const authTag = cipher.getAuthTag();

      console.log('   📊 Encrypted length:', encrypted.length, 'bytes');
      console.log('   📊 Final length:', final.length, 'bytes');
      console.log('   🔑 AuthTag length:', authTag.length, 'bytes');

      // Concatena: encrypted + final + authTag
      const resultBuf = Buffer.concat([encrypted, final, authTag]);
      console.log('   📦 Buffer total length:', resultBuf.length, 'bytes');

      const base64Result = resultBuf.toString('base64');
      console.log('   ✅ Base64 length:', base64Result.length, 'caracteres');

      return base64Result;
    } else {
      // CBC mode (também precisa inverter IV)
      const flippedIV = Buffer.alloc(iv.length);
      for (let i = 0; i < iv.length; i++) {
        flippedIV[i] = ~iv[i];
      }

      console.log('🔄 IV invertido (hex):', flippedIV.toString('hex'));
      console.log('   ⚙️ Usando modo CBC com IV invertido');

      const cipher = crypto.createCipheriv(aesAlg, aesKey, flippedIV);
      let encrypted = cipher.update(jsonString, 'utf8', 'base64');
      encrypted += cipher.final('base64');

      console.log('   ✅ Base64 CBC length:', encrypted.length);
      return encrypted;
    }
  }

  /* ============================================================
 * 🔍 FUNÇÃO AUXILIAR
 * ============================================================ */
function getMimeType(fileName) {
  const lower = (fileName || '').toLowerCase();
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.mp4')) return 'video/mp4';
  if (lower.endsWith('.pdf')) return 'application/pdf';
  return 'application/octet-stream';
}

function toBase64(buffer) {
  return Buffer.from(buffer).toString('base64');
}

/* ============================================================
 * 🧩 DESCRIPTOGRAFIA DE MÍDIA DO WHATSAPP (DOCUMENTADO)
 * ============================================================ */
async function decryptMedia({ cdn_url, encryption_metadata, file_name }) {
  console.log('\n[n8nService.decryptMedia] Iniciando descriptografia de mídia...');
  console.log('[n8nService.decryptMedia] CDN URL:', cdn_url);
  console.log('[n8nService.decryptMedia] Encryption metadata:', encryption_metadata);

  const { encryption_key, hmac_key, iv, encrypted_hash, plaintext_hash } = encryption_metadata;

  const aesKey = Buffer.from(encryption_key, 'base64');
  const hmacKey = Buffer.from(hmac_key, 'base64');
  const ivBuf = Buffer.from(iv, 'base64');

  console.log('🔑 AES key length:', aesKey.length);
  console.log('🔑 HMAC key length:', hmacKey.length);
  console.log('🎲 IV length:', ivBuf.length);

  // 1️⃣ Baixa o arquivo criptografado da CDN
  console.log('[n8nService.decryptMedia] Baixando arquivo da CDN...');
  const response = await fetch(cdn_url, {
    headers: { Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}` },
  });

  const cdnBuffer = Buffer.from(await response.arrayBuffer());
  console.log('📦 Arquivo baixado:', cdnBuffer.length, 'bytes');

  // 2️⃣ Valida SHA256(cdn_file) == encrypted_hash
  const encHash = crypto.createHash('sha256').update(cdnBuffer).digest('base64');
  console.log('📄 encrypted_hash esperado:', encrypted_hash);
  console.log('📄 encrypted_hash calculado:', encHash);
  if (encHash !== encrypted_hash) {
    throw new Error('Hash do arquivo não confere — arquivo corrompido');
  }

  // 3️⃣ Separa o conteúdo: ciphertext + HMAC10
  const ciphertext = cdnBuffer.subarray(0, cdnBuffer.length - 10);
  const hmac10 = cdnBuffer.subarray(cdnBuffer.length - 10);

  // 4️⃣ Calcula HMAC completo e compara os 10 primeiros bytes
  const hmacFull = crypto
    .createHmac('sha256', hmacKey)
    .update(Buffer.concat([ivBuf, ciphertext]))
    .digest();

  const hmacCalc10 = hmacFull.subarray(0, 10);
  const hmacMatch = hmac10.equals(hmacCalc10);

  console.log('🔹 HMAC esperado (10 bytes):', hmac10.toString('base64'));
  console.log('🔹 HMAC calculado (10 bytes):', hmacCalc10.toString('base64'));
  console.log('✅ HMAC válido?', hmacMatch);

  if (!hmacMatch) {
    throw new Error('Falha na validação HMAC — dados podem estar incompletos.');
  }

  // 5️⃣ Descriptografa com AES-256-CBC
  console.log('🔐 Iniciando descriptografia AES-256-CBC...');
  const decipher = crypto.createDecipheriv('aes-256-cbc', aesKey, ivBuf);
  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  console.log('✅ Descriptografia concluída. Tamanho:', decrypted.length, 'bytes');

  // 6️⃣ Valida SHA256(decrypted_media) == plaintext_hash
  const plainHash = crypto.createHash('sha256').update(decrypted).digest('base64');
  console.log('📄 plaintext_hash esperado:', plaintext_hash);
  console.log('📄 plaintext_hash calculado:', plainHash);
  if (plainHash !== plaintext_hash) {
    throw new Error('Falha na validação do plaintext_hash — mídia incorreta.');
  }

  // 7️⃣ Retorna buffer e headers prontos para resposta HTTP
  const mimeType = getMimeType(file_name);
  console.log('📄 MIME type detectado:', mimeType);

  return {
    mimeType,
    buffer: decrypted,
    base64: decrypted.toString('base64'),
  };
}

  export default {
    decryptFlowPayload,
    encryptFlowResponse,
    decryptMedia,
  };
