import express from 'express';
import S3ClientUtil from '../../../utils/s3.js';
import ChatRepository from '../../repositories/chat-history.repository.js';
import { isValidUUID } from '../../../utils/validate.js';

// Função para assinar URLs de mídia
const signMessageMediaUrl = async (messageData) => {
  if (!messageData.midia_url) {
    return messageData;
  }

  try {
    const url = new URL(messageData.midia_url);

    // Ignora URLs do ai-images-n8n
    if (url.hostname.includes('ai-images-n8n')) {
      return messageData;
    }

    // Assina URLs do bucket communication-latta
    if (url.hostname.includes('communication-latta')) {
      const key = decodeURIComponent(url.pathname.slice(1));

      const signedUrl = await S3ClientUtil.getObjectSignedUrl({
        bucketName: 'communication-latta',
        key,
      });

      messageData.midia_url = signedUrl;
    }
  } catch (e) {
    console.error('Erro ao assinar URL S3:', e.message);
  }

  return messageData;
};

// Função para buscar mensagem de reply
const attachReplyMessage = async (messageData) => {
  if (messageData.reply && isValidUUID(messageData.reply)) {
    try {
      const replyMessage = await ChatRepository.getReplyMessageById({
        replyId: messageData.reply,
      });

      if (replyMessage) {
        messageData.replyMessage = replyMessage;
      }
    } catch (e) {
      console.error('Erro ao buscar mensagem de reply:', e.message);
    }
  }

  return messageData;
};

function createSocketRoutes(io, clinicConnections) {
  const router = express.Router();

  // Webhook para nova mensagem
  router.post('/webhook/new-message', express.json(), async (req, res) => {
    try {
      const {
        id,
        clinic_id,
        contact_id,
        message_id,
        template_id,
        message_type,
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

      if (!clinic_id || !contact_id) {
        return res.status(400).json({
          success: false,
          error: 'clinic_id e contact_id são obrigatórios',
        });
      }

      // 🔥 MUDANÇA: Verificar atendentes mas não bloquear envio
      const clinicAttendants = clinicConnections.get(clinic_id);

      if (!clinicAttendants || clinicAttendants.size === 0) {
        console.log(`📱 Nenhum atendente online na clínica ${clinic_id}`);
        // MAS AINDA ASSIM ENVIAR PARA DEBUG:

        let messageData = {
          /* ... */
        };
        messageData = await signMessageMediaUrl(messageData);
        messageData = await attachReplyMessage(messageData);

        io.to('debug_global').emit('new_message', messageData);

        // Retornar que não há atendentes (para N8N não falhar)
        return res.json({
          success: true,
          sent: false,
          reason: 'no_attendants_online',
          debug_notified: true,
          clinic_id,
        });
      }

      let messageData = {
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
        journey,
        message_type,
        source: 'client',
      };

      // Tratamentos
      messageData = await signMessageMediaUrl(messageData);
      messageData = await attachReplyMessage(messageData);

      // 🔥 SEMPRE enviar, independente de ter atendentes
      const roomName = `clinic_${clinic_id}`;

      console.log(`📨 Enviando mensagem para sala: ${roomName}`);
      io.to(roomName).emit('new_message', messageData);

      console.log(`🐛 Enviando mensagem para debugger global`);
      io.to('debug_global').emit('new_message', messageData);

      console.log(`📨 Mensagem enviada - Atendentes na clínica: ${clinicAttendants?.size || 0}`);
      console.log(`📞 Cliente: ${name} (${cell_phone})`);

      res.json({
        success: true,
        sent: true,
        attendants_notified: clinicAttendants?.size || 0,
        debug_notified: true,
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

  // Status dos WebSockets
  router.get('/websocket/status', (_req, res) => {
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

    // 🔥 NOVO: Verificar se há debugger conectado
    const debuggerSockets = Array.from(io.sockets.sockets.values()).filter(
      (socket) => socket.user?.email === 'debuger@latta.app',
    );

    res.json({
      total_clinics_with_connections: clinicConnections.size,
      total_connections: Array.from(clinicConnections.values()).reduce(
        (sum, map) => sum + map.size,
        0,
      ),
      debugger_connected: debuggerSockets.length > 0,
      debugger_sessions: debuggerSockets.length,
      clinics: status,
    });
  });

  router.post('/test-socket', express.json(), async (req, res) => {
    console.log('🧪 TESTE: Enviando mensagem para debug_global');

    const testMessage = {
      id: 'test-' + Date.now(),
      clinic_id: '524f5b01-20b7-45e0-adf4-7b4eecea938a',
      contact_id: 'test-contact',
      message: 'MENSAGEM DE TESTE DO SOCKET',
      timestamp: new Date(),
      source: 'test',
      name: 'Teste',
      role: 'client',
    };

    console.log('🧪 Enviando para clinic_524f5b01-20b7-45e0-adf4-7b4eecea938a');
    io.to('clinic_524f5b01-20b7-45e0-adf4-7b4eecea938a').emit('new_message', testMessage);

    console.log('🧪 Enviando para debug_global');
    io.to('debug_global').emit('new_message', testMessage);

    res.json({
      success: true,
      message: 'Mensagens enviadas',
      rooms: Array.from(io.sockets.adapter.rooms.keys()),
    });
  });

  return router;
}

export default createSocketRoutes;
