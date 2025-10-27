import WebScrappingService from '../services/web-scrapping.service.js';

const data = JSON.parse(process.argv[2] || '{}');

(async () => {
  try {
    const result = await WebScrappingService.runCheckoutFlow(data);

    // Envia o resultado para o processo pai via IPC
    if (process.send) {
      process.send({
        status: 'success',
        pixCode: result.pixCode,
      });
    }

    // Aguarda um sinal do pai antes de fechar o browser
    // Isso garante que o controller já respondeu ao cliente
    process.on('message', async (msg) => {
      if (msg === 'close') {
        console.log('📨 [worker] Recebeu sinal para fechar browser...');
        if (result.close) {
          await result.close();
        }
        process.exit(0);
      }
    });

    // Timeout de segurança: se não receber 'close' em 10s, fecha sozinho
    setTimeout(async () => {
      console.log('⏱️ [worker] Timeout - fechando browser automaticamente...');
      if (result.close) {
        await result.close();
      }
      process.exit(0);
    }, 10000);
  } catch (err) {
    console.error('❌ [worker] Erro no runCheckoutFlow:', err);
    if (process.send) {
      process.send({ status: 'error', message: err.message });
    }
    process.exit(1);
  }
})();
