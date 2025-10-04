import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';

const clinicConnections = new Map();
const userLastSeen = new Map();

function initializeSocket(httpServer) {
  const io = new Server(httpServer, {
    cors: {
      origin: process.env.FRONTEND_URL || 'https://latta.app.br',
      methods: ['GET', 'POST'],
      credentials: true,
    },
    transports: ['websocket', 'polling'],
    allowEIO3: true,
    pingTimeout: 60000,
    pingInterval: 25000,
    maxHttpBufferSize: 1e6,
    connectTimeout: 45000,
    forceNew: false,
    reconnection: true,
    reconnectionDelay: 5000,
    reconnectionDelayMax: 10000,
    maxReconnectionAttempts: 5,
  });

  // Middleware de autenticação
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token;
      if (!token) return next(new Error('Token não fornecido'));

      const decoded = jwt.verify(token, process.env.JWT_SECRET);
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

  io.on('connection', (socket) => {
    const { id: userId, clinic_id: clinicId, email } = socket.user;
    const userName = socket.user.name || 'Atendente';

    // 🔥 CORREÇÃO: Verificar debugger ANTES de qualquer outra lógica
    const isDebugUser = email === 'debuger@latta.app';
    const userKey = `${userId}-${isDebugUser ? 'debug' : clinicId}`;

    console.log(`🔗 Atendente conectado: ${userName} (${userId})`);

    if (isDebugUser) {
      console.log(`🐛 USUÁRIO DEBUGGER DETECTADO - Modo Global Ativado`);
      console.log(`📍 Email: ${email}`);
    } else {
      console.log(`📍 Clínica: ${clinicId}`);
    }

    // Verificar reconexão muito rápida (loop)
    if (!isDebugUser) {
      const lastSeen = userLastSeen.get(userKey);
      if (lastSeen && Date.now() - lastSeen < 2000) {
        console.log(
          `⚠️ Conexão muito rápida detectada para ${userId}, possível loop. Aguardando...`,
        );
        socket.emit('connection_throttled', {
          message: 'Aguarde antes de reconectar',
          waitTime: 2000,
        });
        socket.disconnect(true);
        return;
      }
    }

    // 🔥 LÓGICA SEPARADA: Debugger vs Usuário Normal
    if (isDebugUser) {
      // ==========================================
      // DEBUGGER: Entra APENAS na sala global
      // ==========================================

      // 🧹 CORREÇÃO: remover conexões antigas do mesmo debugger
      const existingDebugSockets = Array.from(io.sockets.sockets.values()).filter(
        (s) => s.user?.email === 'debuger@latta.app' && s.id !== socket.id,
      );

      for (const oldSocket of existingDebugSockets) {
        console.log(`🧹 Removendo sessão antiga do debugger: ${oldSocket.id}`);
        oldSocket.leave('debug_global');
        oldSocket.disconnect(true);
      }

      socket.join('debug_global');
      console.log(`✅ Debugger adicionado à sala 'debug_global'`);
      console.log(`📊 Salas do socket:`, Array.from(socket.rooms));

      // Notificar sobre modo debug
      socket.emit('debug_mode_active', {
        message: 'Modo debug ativo - você receberá mensagens de todas as clínicas',
        timestamp: new Date(),
      });
    } else {
      // ==========================================
      // USUÁRIO NORMAL: Validar clinic_id
      // ==========================================
      if (!clinicId) {
        console.error(`❌ Usuário ${userId} sem clinic_id`);
        socket.emit('connection_error', {
          error: 'Usuário sem clínica associada',
        });
        socket.disconnect(true);
        return;
      }

      // Gerenciar conexões da clínica
      if (!clinicConnections.has(clinicId)) {
        clinicConnections.set(clinicId, new Map());
      }

      const clinicUsers = clinicConnections.get(clinicId);
      const existingConnection = clinicUsers.get(userId);

      if (existingConnection) {
        console.log(`⚠️ Substituindo conexão existente do usuário ${userId}`);

        const existingSocket = io.sockets.sockets.get(existingConnection.socketId);
        if (existingSocket && existingSocket.id !== socket.id) {
          existingSocket.emit('connection_replaced', {
            message: 'Sua conexão foi substituída por uma nova sessão',
          });
          existingSocket.removeAllListeners();
          existingSocket.disconnect(true);
        }
      }

      // Adicionar nova conexão
      clinicUsers.set(userId, {
        socketId: socket.id,
        userName,
        connectedAt: new Date(),
        isActive: true,
      });

      socket.join(`clinic_${clinicId}`);
      console.log(`✅ Usuário adicionado à sala 'clinic_${clinicId}'`);
      console.log(`📊 Conexões ativas na clínica ${clinicId}: ${clinicUsers.size}`);
      console.log(`📊 Salas do socket:`, Array.from(socket.rooms));

      // Notificar outros atendentes
      socket.to(`clinic_${clinicId}`).emit('attendant_connected', {
        userId,
        userName,
        timestamp: new Date(),
      });
    }

    userLastSeen.set(userKey, Date.now());

    // Rate limiting para ping/pong
    let lastPing = 0;
    let pingCount = 0;
    const PING_RATE_LIMIT = 2000;
    const MAX_PINGS_PER_MINUTE = 30;

    socket.on('ping', () => {
      const now = Date.now();

      if (now - lastPing > 60000) {
        pingCount = 0;
      }

      if (now - lastPing > PING_RATE_LIMIT && pingCount < MAX_PINGS_PER_MINUTE) {
        lastPing = now;
        pingCount++;
        socket.emit('pong');
      } else if (pingCount >= MAX_PINGS_PER_MINUTE) {
        console.log(`⚠️ Rate limit atingido para ping do usuário ${userId}`);
        socket.emit('rate_limit_exceeded', {
          message: 'Muitas tentativas de ping',
        });
      }
    });

    // Heartbeat
    let heartbeatInterval;
    let missedHeartbeats = 0;
    const MAX_MISSED_HEARTBEATS = 3;

    const startHeartbeat = () => {
      heartbeatInterval = setInterval(() => {
        if (socket.connected) {
          socket.emit('heartbeat', { timestamp: Date.now() });
          missedHeartbeats++;

          if (missedHeartbeats > MAX_MISSED_HEARTBEATS) {
            console.log(`💔 Heartbeat perdido para ${userName}, desconectando...`);
            socket.disconnect(true);
            return;
          }
        } else {
          clearInterval(heartbeatInterval);
        }
      }, 30000);
    };

    socket.on('heartbeat_ack', () => {
      missedHeartbeats = 0;
    });

    socket.on('manual_reconnect', () => {
      console.log(`🔄 Reconexão manual solicitada por ${userName}`);
    });

    // Handler de desconexão
    const handleDisconnection = (reason) => {
      console.log(`❌ Atendente desconectado: ${userName} - Motivo: ${reason}`);

      userLastSeen.set(userKey, Date.now());

      if (heartbeatInterval) {
        clearInterval(heartbeatInterval);
      }

      // Cleanup apenas para usuários normais (não debugger)
      if (!isDebugUser && clinicId && clinicConnections.has(clinicId)) {
        const currentConnection = clinicConnections.get(clinicId).get(userId);
        if (currentConnection && currentConnection.socketId === socket.id) {
          clinicConnections.get(clinicId).delete(userId);

          if (clinicConnections.get(clinicId).size === 0) {
            clinicConnections.delete(clinicId);
          }

          socket.to(`clinic_${clinicId}`).emit('attendant_disconnected', {
            userId,
            userName,
            timestamp: new Date(),
          });

          console.log(
            `📊 Conexões restantes na clínica ${clinicId}:`,
            clinicConnections.get(clinicId)?.size || 0,
          );
        }
      }
    };

    socket.on('disconnect', handleDisconnection);
    socket.on('error', (error) => {
      console.error(`❌ Erro no socket ${socket.id}:`, error);
      handleDisconnection('error');
    });

    startHeartbeat();

    // Confirmar conexão
    socket.emit('connection_confirmed', {
      userId,
      clinicId: clinicId || 'debug',
      isDebugMode: isDebugUser,
      timestamp: Date.now(),
      rooms: Array.from(socket.rooms),
      message: 'Conexão estabelecida com sucesso',
    });
  });

  io.engine.on('connection_error', (error) => {
    console.error('❌ Erro de conexão do socket.io:', error);
  });

  // Limpeza periódica
  setInterval(() => {
    const now = Date.now();
    const CLEANUP_THRESHOLD = 300000;

    for (const [userKey, lastSeen] of userLastSeen.entries()) {
      if (now - lastSeen > CLEANUP_THRESHOLD) {
        userLastSeen.delete(userKey);
      }
    }
  }, 60000);

  return { io, clinicConnections };
}

export { initializeSocket };
