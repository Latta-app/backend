import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';

// Refactor 2026-05-08: visão unificada — todos os usuários autenticados (apenas
// 2 sócios hoje) entram em uma única sala global e veem todas as mensagens.
// Se voltar multi-clinic no futuro, reintroduzir clinic-specific rooms.
const MESSAGING_ROOM = 'messaging_global';

const userLastSeen = new Map();
const userSockets = new Map();

function initializeSocket(httpServer) {
  const io = new Server(httpServer, {
    cors: {
      origin: process.env.FRONTEND_URL || 'https://latta.app.br',
      methods: ['GET', 'POST'],
      credentials: true,
    },
    transports: ['websocket', 'polling'],
    allowEIO3: true,
    // Ping rápido (10s) + timeout curto (20s) pra detectar sockets mortos em
    // ~20s em vez de 60s+. Reduz janela em que o admin vê "conectado" mas não
    // recebe `new_message` porque a WS caiu silenciosa.
    pingTimeout: 20000,
    pingInterval: 10000,
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
    const { id: userId } = socket.user;
    const userName = socket.user.name || 'Atendente';

    console.log(`🔗 Atendente conectado: ${userName} (${userId})`);

    // Throttle de reconexão muito rápida (loop de cliente)
    const lastSeen = userLastSeen.get(userId);
    if (lastSeen && Date.now() - lastSeen < 2000) {
      console.log(`⚠️ Reconexão muito rápida para ${userId}, descartando.`);
      socket.emit('connection_throttled', {
        message: 'Aguarde antes de reconectar',
        waitTime: 2000,
      });
      socket.disconnect(true);
      return;
    }

    // Substitui conexão prévia do mesmo usuário (evita duplicar handlers e
    // mensagens duplicadas no painel quando o navegador reabre o socket).
    const existingSocketId = userSockets.get(userId);
    if (existingSocketId && existingSocketId !== socket.id) {
      const existingSocket = io.sockets.sockets.get(existingSocketId);
      if (existingSocket) {
        existingSocket.emit('connection_replaced', {
          message: 'Sua conexão foi substituída por uma nova sessão',
        });
        existingSocket.removeAllListeners();
        existingSocket.disconnect(true);
      }
    }
    userSockets.set(userId, socket.id);

    socket.join(MESSAGING_ROOM);
    console.log(`✅ Usuário ${userName} adicionado à sala '${MESSAGING_ROOM}'`);

    // Notifica os outros conectados
    socket.to(MESSAGING_ROOM).emit('attendant_connected', {
      userId,
      userName,
      timestamp: new Date(),
    });

    userLastSeen.set(userId, Date.now());

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

      userLastSeen.set(userId, Date.now());

      if (heartbeatInterval) {
        clearInterval(heartbeatInterval);
      }

      // Limpa o pointer só se ainda for este socket (uma reconexão substituta
      // pode ter acabado de re-setar pra um id novo).
      if (userSockets.get(userId) === socket.id) {
        userSockets.delete(userId);
      }

      socket.to(MESSAGING_ROOM).emit('attendant_disconnected', {
        userId,
        userName,
        timestamp: new Date(),
      });
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

    for (const [userId, lastSeenAt] of userLastSeen.entries()) {
      if (now - lastSeenAt > CLEANUP_THRESHOLD) {
        userLastSeen.delete(userId);
      }
    }
  }, 60000);

  return { io, MESSAGING_ROOM };
}

export { initializeSocket, MESSAGING_ROOM };
