import path from 'path';
import { fork } from 'child_process';

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

export default { downloadImage };
