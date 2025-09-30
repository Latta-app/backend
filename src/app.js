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

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

export { io };
