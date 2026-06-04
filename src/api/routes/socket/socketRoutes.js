import express from 'express';
import S3ClientUtil from '../../../utils/s3.js';
import ChatRepository from '../../repositories/chat-history.repository.js';
import { isValidUUID } from '../../../utils/validate.js';
import { MESSAGING_ROOM, messagingEnvRoom } from '../../../config/socket.js';
import { isQaPhone } from '../../../utils/staging-users.helper.js';

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

function createSocketRoutes(io) {
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

      // ADR-0007 Fatia 7 (fix 2026-06-04): roteia o push pela sala do ambiente.
      // QA (whitelist staging_users OU range test-persona) -> painel homolog;
      // cliente real -> painel prod. Espelha o filtro da listagem REST, que
      // antes divergia do socket (broadcast global vazava QA<->prod ao vivo,
      // ate dar F5). Fallback: sem cell_phone, mantem broadcast global (raro —
      // toda chat_history tem cell_phone; nao arriscar sumir msg de um painel).
      let targetRoom = MESSAGING_ROOM;
      if (cell_phone) {
        const targetEnv = (await isQaPhone(cell_phone)) ? 'homolog' : 'prod';
        targetRoom = messagingEnvRoom(targetEnv);
      } else {
        console.warn('⚠️ new_message sem cell_phone — broadcast global (fallback)');
      }

      const room = io.sockets.adapter.rooms.get(targetRoom);
      console.log(
        room
          ? `✅ Sala '${targetRoom}' com ${room.size} sockets`
          : `❌ Sala '${targetRoom}' vazia`,
      );

      io.to(targetRoom).emit('new_message', messageData);
      console.log(`📤 new_message emitido para '${targetRoom}' (phone=${cell_phone || 'n/a'})`);

      res.json({
        success: true,
        sent: true,
        room: targetRoom,
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

    const testMessage = {
      id: 'test-' + Date.now(),
      contact_id: 'test-contact',
      message: 'MENSAGEM DE TESTE DO SOCKET',
      timestamp: new Date(),
      source: 'test',
      name: 'Teste',
      role: 'client',
    };

    const allRooms = Array.from(io.sockets.adapter.rooms.keys());
    const room = io.sockets.adapter.rooms.get(MESSAGING_ROOM);

    io.to(MESSAGING_ROOM).emit('new_message', testMessage);

    res.json({
      success: true,
      rooms: allRooms,
      messagingRoomSize: room?.size || 0,
    });
  });

  return router;
}

export default createSocketRoutes;
