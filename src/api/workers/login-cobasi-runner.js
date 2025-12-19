import { runLoginFlowCobasi } from '../services/web-scrapping.service.js';

const data = JSON.parse(process.argv[2] || '{}');

// Helper para garantir que logs apareçam
const log = (msg) => {
  console.log(msg);
  process.stderr.write(msg + '\n'); // força stderr também
};

(async () => {
  try {
    log('🔐 [WORKER:COBASI] Iniciando...');
    const result = await runLoginFlowCobasi(data);

    if (result.status === 'success') {
      log('✅ [WORKER:COBASI] Success - enviando cookies');
      process.send({ status: 'success', cookies: result.cookies });
      await result.close();
      process.exit(0);
    }

    // Se não for success, algo deu errado
    log('❌ [WORKER:COBASI] Falhou sem erro específico');
    process.send({ status: 'error', message: 'Login falhou sem erro específico' });
    process.exit(1);
  } catch (err) {
    log(`❌ [WORKER:COBASI] Erro: ${err.message}`);
    process.send({ status: 'error', message: err.message });
    process.exit(1);
  }
})();

// Safety timeout (2min)
setTimeout(() => {
  log('⏱️ [WORKER:COBASI] Timeout de segurança (2min)');
  process.exit(1);
}, 2 * 60 * 1000);
