// app.js - Modificado para incluir WebSocket
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import helmet from 'helmet';
import { createServer } from 'http';
import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';
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
  'JWT_SECRET', // Adicionado para o WebSocket
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

// Configuração do Socket.IO
const io = new Server(httpServer, {
  cors: {
    origin: process.env.FRONTEND_URL || 'https://latta.app.br',
    methods: ['GET', 'POST'],
    credentials: true,
  },
  // Adicionar estas configurações para produção
  transports: ['websocket', 'polling'],
  allowEIO3: true,
  pingTimeout: 60000,
  pingInterval: 25000,
});

// Armazenar conexões ativas por clinic_id
const clinicConnections = new Map();

// Middleware de autenticação para WebSocket
io.use(async (socket, next) => {
  try {
    const token = socket.handshake.auth.token;

    if (!token) {
      return next(new Error('Token não fornecido'));
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Validar se é um atendente
    const allowedRoles = ['admin', 'superAdmin', 'attendant'];
    const userRole = decoded.role?.role?.toLowerCase();

    if (!allowedRoles.includes(userRole)) {
      return next(new Error('Acesso não autorizado'));
    }

    socket.user = decoded;
    next();
  } catch (error) {
    console.error('WebSocket auth error:', error);
    next(new Error('Token inválido'));
  }
});

// Gerenciamento de conexões WebSocket
io.on('connection', (socket) => {
  const { id: userId, clinic_id: clinicId } = socket.user;
  // Buscar o nome do usuário no objeto user (que está dentro do token)
  const userName = socket.user.name || 'Atendente';

  console.log(`🔗 Atendente conectado: ${userName} (${userId}) - Clínica: ${clinicId}`);

  // Adicionar à lista de conexões da clínica
  if (!clinicConnections.has(clinicId)) {
    clinicConnections.set(clinicId, new Map());
  }

  clinicConnections.get(clinicId).set(userId, {
    socketId: socket.id,
    userName: userName,
    connectedAt: new Date(),
  });

  // Notificar outros atendentes da mesma clínica sobre nova conexão
  socket.to(`clinic_${clinicId}`).emit('attendant_connected', {
    userId,
    userName: userName,
    timestamp: new Date(),
  });

  // Juntar à sala da clínica
  socket.join(`clinic_${clinicId}`);

  console.log(
    `📊 Conexões ativas na clínica ${clinicId}:`,
    clinicConnections.get(clinicId)?.size || 0,
  );

  // Heartbeat para verificar se conexão está ativa
  socket.on('ping', () => {
    socket.emit('pong');
  });

  // Desconexão
  socket.on('disconnect', (reason) => {
    console.log(`❌ Atendente desconectado: ${userName} - Motivo: ${reason}`);

    // Remover da lista de conexões
    if (clinicConnections.has(clinicId)) {
      clinicConnections.get(clinicId).delete(userId);

      // Se não há mais conexões da clínica, remover o Map
      if (clinicConnections.get(clinicId).size === 0) {
        clinicConnections.delete(clinicId);
      }
    }

    // Notificar outros atendentes sobre desconexão
    socket.to(`clinic_${clinicId}`).emit('attendant_disconnected', {
      userId,
      userName: userName,
      timestamp: new Date(),
    });

    console.log(
      `📊 Conexões restantes na clínica ${clinicId}:`,
      clinicConnections.get(clinicId)?.size || 0,
    );
  });
});

// Middleware do Express
app.use(cors(corsConfig));
app.use(express.json(jsonConfig));
app.use(helmet());
app.use(limiter);

// Endpoint para n8n enviar notificações de novas mensagens
app.post('/api/webhook/new-message', express.json(), (req, res) => {
  try {
    const {
      id,
      clinic_id,
      contact_id,
      message_id,
      template_id,
      name,
      window_timestamp,
      message,
      sent_by,
      sent_to,
      role,
      date,
      midia_url,
      thumb_url,
      ai_accepted,
      reply,
      ai_output,
      pet_owner_id,
      midia_name,
      path,
      is_modified,
      user_id,
      is_answered,
      cell_phone,
      timestamp,
      journey,
    } = req.body;

    // Validação básica
    if (!clinic_id || !contact_id) {
      return res.status(400).json({
        success: false,
        error: 'clinic_id e contact_id são obrigatórios',
      });
    }

    // Verificar se há atendentes conectados nesta clínica
    const clinicAttendeants = clinicConnections.get(clinic_id);

    if (!clinicAttendeants || clinicAttendeants.size === 0) {
      console.log(`📱 Nenhum atendente online na clínica ${clinic_id}`);
      return res.json({
        success: true,
        sent: false,
        reason: 'no_attendants_online',
        clinic_id,
      });
    }

    // Dados da mensagem para enviar via WebSocket
    const messageData = {
      id,
      clinic_id,
      contact_id,
      message_id,
      template_id,
      name,
      window_timestamp,
      message: message || '',
      sent_by,
      sent_to,
      role,
      date,
      midia_url,
      thumb_url,
      ai_accepted,
      reply,
      ai_output,
      pet_owner_id,
      midia_name,
      path,
      is_modified,
      user_id,
      is_answered,
      cell_phone,
      timestamp: timestamp || new Date(),
      cell_phone,
      message_id,
      journey,
      source: 'client',
    };

    // Enviar para todos os atendentes da clínica
    io.to(`clinic_${clinic_id}`).emit('new_message', messageData);

    console.log(
      `📨 Nova mensagem enviada para ${clinicAttendeants.size} atendente(s) da clínica ${clinic_id}`,
    );
    console.log(`📞 Cliente: ${name} (${cell_phone})`);

    res.json({
      success: true,
      sent: true,
      attendeants_notified: clinicAttendeants.size,
      clinic_id,
    });
  } catch (error) {
    console.error('❌ Erro ao processar nova mensagem:', error);
    res.status(500).json({
      success: false,
      error: 'Erro interno do servidor',
    });
  }
});

// Endpoint para verificar status das conexões (útil para debug)
app.get('/api/websocket/status', (req, res) => {
  const status = {};

  for (const [clinicId, connections] of clinicConnections.entries()) {
    status[clinicId] = {
      attendeants_online: connections.size,
      attendeants: Array.from(connections.values()).map((conn) => ({
        userName: conn.userName,
        connectedAt: conn.connectedAt,
      })),
    };
  }

  res.json({
    total_clinics_with_connections: clinicConnections.size,
    total_connections: Array.from(clinicConnections.values()).reduce(
      (sum, map) => sum + map.size,
      0,
    ),
    clinics: status,
  });
});

// Rotas existentes
app.use('/api/', privateRoutes);

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

  // Fechar conexões WebSocket
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

// Exportar io para uso em outros módulos se necessário
export { io };
