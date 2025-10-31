import fs from 'fs';
import path from 'path';
import { fork } from 'child_process';

const PIX_FILE = path.join(process.cwd(), 'tmp/pix-session.json');

const startScrapping = async (req, res) => {
  console.log('==============================');
  console.log('🧩 [controller] Iniciando scraping via worker');
  console.log('==============================');

  const checkoutData = req.body;
  if (!checkoutData?.products?.length) {
    return res.status(400).json({
      code: 'INVALID_DATA',
      message: 'Envie pelo menos um produto no corpo da requisição',
    });
  }

  try {
    // Limpa arquivo antigo
    if (fs.existsSync(PIX_FILE)) fs.unlinkSync(PIX_FILE);

    const workerPath = path.resolve('src/api/workers/scrapper-runner.js');
    console.log('👷 [controller] Iniciando processo filho:', workerPath);

    const child = fork(workerPath, [JSON.stringify(checkoutData)], {
      silent: true,
      // Importante: habilita IPC
      stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
    });

    // Logs do worker
    child.stdout.on('data', (d) => process.stdout.write(`[worker] ${d}`));
    child.stderr.on('data', (d) => process.stderr.write(`[worker-err] ${d}`));

    // Promise que aguarda a mensagem IPC do worker
    const pixCodePromise = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        // ✅ armazena a referência
        reject(new Error('TIMEOUT'));
      }, 360000);

      child.on('message', (msg) => {
        console.log('📨 [controller] Recebeu mensagem do worker:', msg);
        clearTimeout(timeout);

        if (msg.status === 'success') {
          resolve(msg.pixCode);
        } else {
          reject(new Error(msg.message || 'Worker error'));
        }
      });

      child.on('exit', (code) => {
        if (code !== 0) {
          clearTimeout(timeout);
          reject(new Error(`Worker encerrou com código ${code}`));
        }
      });
    });

    const pixCode = await pixCodePromise;

    if (!pixCode) {
      console.log('⚠️ [controller] PIX não encontrado.');
      return res.status(500).json({
        code: 'NO_PIX',
        message: 'O PIX não foi gerado',
      });
    }

    console.log('✅ [controller] PIX obtido:', pixCode);

    // Responde ao cliente ANTES de fechar o browser
    res.status(200).json({ success: true, pix: pixCode });

    // Agora sim, sinaliza o worker para fechar o browser
    console.log('📤 [controller] Enviando sinal de fechamento para o worker...');
    child.send('close');
  } catch (err) {
    console.error('❌ [controller] Erro geral:', err);

    if (err.message === 'TIMEOUT') {
      return res.status(504).json({
        code: 'TIMEOUT',
        message: 'O PIX não foi gerado dentro do tempo limite',
      });
    }

    return res.status(500).json({
      code: 'SCRAPPING_ERROR',
      message: 'Erro ao executar automação',
      error: err.message,
    });
  }
};

export default { startScrapping };
