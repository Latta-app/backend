import { runLoginFlowCobasi } from '../services/web-scrapping.service.js';

const data = JSON.parse(process.argv[2] || '{}');

(async () => {
  try {
    const result = await runLoginFlowCobasi(data);

    if (result.status === 'success') {
      process.send({ status: 'success', cookies: result.cookies });
      await result.close();
      process.exit(0);
    }

    // Se não for success, algo deu errado
    process.send({ status: 'error', message: 'Login falhou sem erro específico' });
    process.exit(1);
  } catch (err) {
    process.send({ status: 'error', message: err.message });
    process.exit(1);
  }
})();

// Safety timeout (2min)
setTimeout(() => {
  console.error('⏱️ [WORKER:COBASI] Timeout de segurança (2min)');
  process.exit(1);
}, 2 * 60 * 1000);
