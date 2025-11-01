import DownloadImageService from '../services/n8n.service.js';

const data = JSON.parse(process.argv[2] || '{}');

(async () => {
  try {
    const result = await DownloadImageService.runDownload(data.url);

    if (process.send) {
      process.send({
        status: 'success',
        imageBase64: result.imageBase64,
        mimeType: result.mimeType,
      });
    }

    process.exit(0);
  } catch (err) {
    console.error('❌ [worker] Erro no download da imagem:', err);
    if (process.send) {
      process.send({ status: 'error', message: err.message });
    }
    process.exit(1);
  }
})();
