import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import helmet from 'helmet';
import { createServer } from 'http';
import corsConfig from './config/cors.js';
import privateRoutes from './api/routes/privateRoutes.js';
import jsonConfig from './config/express.Json.js';
import limiter from './config/express.limiter.js';
import initializeFirebase from './config/firebase.js';
import { initializeSocket } from './config/socket.js';
import { sequelize, checkDatabaseConnection } from './config/database.js';
import createSocketRoutes from './api/routes/socket/socketRoutes.js';
import { Stagehand } from '@browserbasehq/stagehand';

dotenv.config();

const requiredEnvs = [
  'FIREBASE_PROJECT_ID',
  'FIREBASE_CLIENT_EMAIL',
  'FIREBASE_PRIVATE_KEY',
  'DATABASE_URL',
  'ACCESS_LIST',
  'VAREJO_API_TOKEN',
  'JWT_SECRET',
];

requiredEnvs.forEach((env) => {
  if (!process.env[env]) {
    console.error(`❌ Variável de ambiente ausente: ${env}`);
    process.exit(1);
  }
});

initializeFirebase();
checkDatabaseConnection();

const app = express();
const httpServer = createServer(app);

const { io, clinicConnections } = initializeSocket(httpServer);

app.use(cors(corsConfig));
app.use(express.json(jsonConfig));
app.use(helmet());
app.use(limiter);
app.use('/api/', privateRoutes);
app.use('/api', createSocketRoutes(io, clinicConnections));

app.get('/', (_req, res) => {
  res.status(200).json({ message: '🚀 Server is running with WebSocket!' });
});

const port = process.env.PORT || 8000;

const server = httpServer.listen(port, () => {
  console.log(`🚀 Servidor rodando em http://localhost:${port}`);
  console.log(`🔌 WebSocket disponível em ws://localhost:${port}`);
});

const shutdown = async (signal) => {
  console.log(`⚠️ Recebido ${signal}, encerrando servidor...`);

  io.close(() => {
    console.log('🔌 WebSocket encerrado');
  });

  await sequelize.close();
  server.close(() => {
    console.log('🛑 Servidor encerrado.');
    process.exit(0);
  });
};

// (async () => {
//   console.log('🧪 Testando com keepAlive...');

//   const stagehand = new Stagehand({
//     env: 'BROWSERBASE',
//     apiKey: process.env.BROWSERBASE_API_KEY,
//     projectId: process.env.BROWSERBASE_PROJECT_ID,
//     enableCaching: false,
//     browserbaseSessionCreateParams: {
//       keepAlive: true, // ← MANTÉM SESSÃO VIVA
//     },
//   });

//   try {
//     console.log('⏳ Inicializando...');
//     await stagehand.init();
//     const page = stagehand.page;

//     console.log('✅ Inicializado');

//     // Simula o fluxo do seu código
//     console.log('⏳ Goto Petz...');
//     await page.goto('https://www.petz.com.br', {
//       waitUntil: 'domcontentloaded',
//       timeout: 60000,
//     });
//     console.log('✅ Página carregada');

//     console.log('⏳ Aguardando 3s...');
//     await page.waitForTimeout(3000);

//     console.log('⏳ Executando evaluate...');
//     const logged = await page.evaluate(() => {
//       const hasUser = !!document.querySelector(
//         '.header-user, .header__user-name, [data-testid="user-name"]',
//       );
//       const possibleButtons = Array.from(document.querySelectorAll('a, button'));
//       const hasLoginButton = possibleButtons.some((el) =>
//         el.textContent
//           ?.trim()
//           .toLowerCase()
//           .includes('entrar'),
//       );
//       return hasUser || !hasLoginButton;
//     });

//     console.log('✅ Evaluate executado:', logged);

//     console.log('⏳ Navegando para carrinho...');
//     await page.goto('https://www.petz.com.br/checkout/cart/', {
//       waitUntil: 'domcontentloaded',
//       timeout: 60000,
//     });
//     console.log('✅ Carrinho carregado');

//     console.log('⏳ Aguardando 3s...');
//     await page.waitForTimeout(3000);

//     console.log('⏳ Executando evaluate no carrinho...');
//     const carrinhoLimpo = await page.evaluate(() => {
//       const limparBtn = Array.from(document.querySelectorAll('button, a')).find((el) =>
//         el.textContent
//           ?.trim()
//           .toLowerCase()
//           .includes('limpar sacola'),
//       );
//       return !limparBtn;
//     });

//     console.log('✅ Carrinho verificado:', carrinhoLimpo);

//     await stagehand.close();
//     console.log('✅ Teste completo com sucesso!');
//     process.exit(0);
//   } catch (error) {
//     console.error('❌ Erro:', error);
//     process.exit(1);
//   }
// })();

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

export { io };
