import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import helmet from 'helmet';
import corsConfig from './config/cors.js';
import privateRoutes from './api/routes/privateRoutes.js';
import jsonConfig from './config/express.Json.js';
import limiter from './config/express.limiter.js';
import initializeFirebase from './config/firebase.js';
import { sequelize, checkDatabaseConnection } from './config/database.js';

dotenv.config();

const requiredEnvs = [
  'FIREBASE_PROJECT_ID',
  'FIREBASE_CLIENT_EMAIL',
  'FIREBASE_PRIVATE_KEY',
  'DATABASE_URL',
  'ACCESS_LIST',
  'VAREJO_API_TOKEN',
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
const port = process.env.PORT || 8000;

app.use(cors(corsConfig));
app.use(express.json(jsonConfig));
app.use(helmet());
app.use(limiter);
app.use('/api/', privateRoutes);

app.get('/', (_req, res) => {
  res.status(200).json({ message: '🚀 Server is running!!' });
});

const server = app.listen(port, () => {
  console.log(`🚀 Servidor rodando em http://localhost:${port}`);
});

const shutdown = async (signal) => {
  console.log(`⚠️ Recebido ${signal}, encerrando servidor...`);
  await sequelize.close();
  server.close(() => {
    console.log('🛑 Servidor encerrado.');
    process.exit(0);
  });
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
