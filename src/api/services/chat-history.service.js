import ChatRepository from '../repositories/chat-history.repository.js';
import S3ClientUtil from '../../utils/s3.js';

const getAllMessages = async () => {
  try {
    // Buscar todas as mensagens do repository
    const allMessages = await ChatRepository.getAllMessages();

    if (!allMessages || allMessages.length === 0) {
      return [];
    }

    // Agrupar mensagens por número de telefone
    const groupedMessages = allMessages.reduce((acc, message) => {
      const phone = message.cell_phone;

      if (!acc[phone]) {
        let name = message.name;

        if (name === 'Petland Belvedere' || name === 'Latta') {
          const relatedMessages = allMessages.filter((m) => m.cell_phone === phone);
          const otherName = relatedMessages.find(
            (m) => m.name !== 'Petland Belvedere' && m.name !== 'Latta',
          )?.name;

          name = otherName || 'Nome desconhecido';
        }

        acc[phone] = {
          phone,
          name,
          messages: [],
        };
      }

      acc[phone].messages.push({
        id: message.id,
        message: message.message,
        sent_by: message.sent_by,
        sent_to: message.sent_to,
        role: message.role,
        timestamp: message.timestamp,
        window_timestamp: message.window_timestamp,
        journey: message.journey,
        message_type: message.message_type,
        date: message.date,
        message_id: message.message_id,
        midia_url: message.midia_url,
      });

      return acc;
    }, {});

    // Converter em array e ordenar por timestamp
    const result = Object.values(groupedMessages).map((group) => ({
      ...group,
      messages: group.messages.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp)),
    }));

    // Gerar signed URLs para mensagens com mídia
    for (const group of result) {
      for (const message of group.messages) {
        if (message.midia_url) {
          try {
            const url = new URL(message.midia_url);
            const key = decodeURIComponent(url.pathname.slice(1)); // remove a primeira "/"

            const signedUrl = await S3ClientUtil.getObjectSignedUrl({
              bucketName: 'communication-latta',
              key,
            });
            message.midia_url = signedUrl;
          } catch (e) {
            console.error('Erro ao assinar URL S3:', e.message);
          }
        }
      }
    }

    return result;
  } catch (error) {
    throw new Error(`Service error: ${error.message}`);
  }
};

const getMessagesByPhone = async ({ phone }) => {
  try {
    if (!phone) {
      throw new Error('Phone parameter is required');
    }

    const messages = await ChatRepository.getMessagesByPhone({ phone });

    if (!messages || messages.length === 0) {
      return {
        phone: phone,
        name: null,
        messages: [],
      };
    }

    const sortedMessages = messages.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

    // Adiciona signed URLs
    for (const msg of sortedMessages) {
      if (msg.midia_url) {
        try {
          const url = new URL(msg.midia_url);
          const key = decodeURIComponent(url.pathname.slice(1));

          const signedUrl = await S3ClientUtil.getObjectSignedUrl({
            bucketName: 'communication-latta',
            key,
          });
          msg.midia_url = signedUrl;
        } catch (e) {
          console.error('Erro ao assinar URL S3:', e.message);
        }
      }
    }

    return {
      phone: phone,
      name: messages[0].name,
      messages: sortedMessages.map((message) => ({
        id: message.id,
        message: message.message,
        sent_by: message.sent_by,
        timestamp: message.timestamp,
        window_timestamp: message.window_timestamp,
        journey: message.journey,
        midia_url: message.midia_url,
        signed_midia_url: message.signed_midia_url,
      })),
    };
  } catch (error) {
    throw new Error(`Service error: ${error.message}`);
  }
};

export default {
  getAllMessages,
  getMessagesByPhone,
};
