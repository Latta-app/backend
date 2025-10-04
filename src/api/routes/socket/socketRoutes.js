import express from 'express';
import S3ClientUtil from '../../../utils/s3.js';
import ChatRepository from '../../repositories/chat-history.repository.js';
import { isValidUUID } from '../../../utils/validate.js';

// Função para assinar URLs de mídia
const signMessageMediaUrl = async (messageData) => {
  if (!messageData.midia_url) return messageData;

  try {
    const url = new URL(messageData.midia_url);

    if (url.hostname.includes('ai-images-n8n')) return messageData;

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

      if (replyMessage) messageData.replyMessage = replyMessage;
    } catch (e) {
      console.error('Erro ao buscar mensagem de reply:', e.message);
    }
  }

  return messageData;
};

function createSocketRoutes(io, clinicConnections) {
  const router = express.Router();

  // ==========================================
  // 🚀 WEBHOOK NOVA MENSAGEM
  // ==========================================
  router.post('/webhook/new-message', express.json(), async (req, res) => {
    try {
      console.log('\n==============================');
      console.log('📩 NOVA MENSAGEM RECEBIDA NO WEBHOOK');
      console.log('Payload:', req.body);

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
        message_type_id,
      } = req.body;

      if (!contact_id) {
        console.log('❌ BLOQUEADO: contact_id ausente');
        return res.status(400).json({ success: false, error: 'contact_id é obrigatório' });
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
        message_type_id,
        source: 'client',
      };

      // Tratamentos
      messageData = await signMessageMediaUrl(messageData);
      messageData = await attachReplyMessage(messageData);

      // ======================
      // 1️⃣ Log de conexões
      // ======================
      const allSockets = Array.from(io.sockets.sockets.values());
      const debuggerSockets = allSockets.filter((s) => s.user?.email === 'debuger@latta.app');
      console.log('🧠 TOTAL DE SOCKETS CONECTADOS:', allSockets.length);
      console.log(
        '🐞 DEBUGGERS ATIVOS:',
        debuggerSockets.map((s) => ({
          id: s.id,
          email: s.user?.email,
          salas: Array.from(s.rooms),
        })),
      );

      // ======================
      // 2️⃣ Emissão para a clínica
      // ======================
      if (clinic_id) {
        const roomName = `clinic_${clinic_id}`;
        const clinicAttendants = clinicConnections.get(clinic_id);
        console.log(`📨 Enviando mensagem para sala: ${roomName}`);
        console.log(`👥 Atendentes conectados nessa clínica: ${clinicAttendants?.size || 0}`);

        io.to(roomName).emit('new_message', messageData);
      } else {
        console.log('⚠️ Mensagem sem clinic_id — será enviada apenas para debug_global');
      }

      // ======================
      // 3️⃣ Emissão global
      // ======================
      console.log(`🐛 Tentando enviar mensagem para sala 'debug_global'...`);
      const debugRoom = io.sockets.adapter.rooms.get('debug_global');
      console.log(
        debugRoom
          ? `✅ Sala 'debug_global' existe com ${debugRoom.size} sockets`
          : '❌ Sala debug_global não existe ou vazia',
      );

      io.to('debug_global').emit('new_message', messageData);
      console.log('📤 Evento new_message emitido para debug_global com sucesso');

      // ======================
      // 4️⃣ Retorno da API
      // ======================
      res.json({
        success: true,
        sent: true,
        clinic_id: clinic_id || null,
        debug_notified: true,
      });

      console.log('✅ Webhook finalizado com sucesso');
      console.log('==============================\n');
    } catch (error) {
      console.error('❌ Erro ao processar nova mensagem:', error);
      res.status(500).json({ success: false, error: 'Erro interno do servidor' });
    }
  });

  // ==========================================
  // TESTE SOCKET
  // ==========================================
  router.post('/test-socket', express.json(), async (_req, res) => {
    console.log('\n🧪 TESTE MANUAL DE SOCKET');
    console.log('📡 Emitindo mensagens de teste para as salas...');

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

    // Log das salas antes de emitir
    const allRooms = Array.from(io.sockets.adapter.rooms.keys());
    console.log('📡 Todas as salas atuais:', allRooms);

    const debugRoom = io.sockets.adapter.rooms.get('debug_global');
    console.log(
      debugRoom
        ? `✅ Sala debug_global com ${debugRoom.size} sockets`
        : '❌ Sala debug_global inexistente',
    );

    io.to('clinic_524f5b01-20b7-45e0-adf4-7b4eecea938a').emit('new_message', testMessage);
    io.to('debug_global').emit('new_message', testMessage);

    console.log('✅ Mensagens de teste emitidas com sucesso');

    res.json({
      success: true,
      rooms: allRooms,
      debugRoomSize: debugRoom?.size || 0,
    });
  });

  return router;
}

export default createSocketRoutes;
