import ChatRepository from '../repositories/chat-history.repository.js';
import S3ClientUtil from '../../utils/s3.js';

const getAllContactsWithMessages = async (page, limit) => {
  try {
    const result = await ChatRepository.getAllContactsWithMessages(page, limit);
    const contacts = result.contacts;

    for (const contact of contacts) {
      const chatHistory = contact.dataValues?.chatHistory || [];

      for (const message of chatHistory) {
        if (message.midia_url) {
          try {
            const url = new URL(message.midia_url);

            if (url.hostname.includes('ai-images-n8n')) {
              continue;
            }

            if (url.hostname.includes('communication-latta')) {
              const key = decodeURIComponent(url.pathname.slice(1));

              const signedUrl = await S3ClientUtil.getObjectSignedUrl({
                bucketName: 'communication-latta',
                key,
              });

              message.midia_url = signedUrl;
            }
          } catch (e) {
            console.error('Erro ao assinar URL S3:', e.message);
          }
        }
      }

      contact.dataValues.chatHistory = chatHistory;
    }

    contacts.sort((a, b) => {
      const aHistory = a.dataValues?.chatHistory || [];
      const bHistory = b.dataValues?.chatHistory || [];

      const aLast = aHistory.length
        ? new Date(
            aHistory.reduce(
              (max, m) => (new Date(m.timestamp) > max ? new Date(m.timestamp) : max),
              new Date(0),
            ),
          )
        : null;

      const bLast = bHistory.length
        ? new Date(
            bHistory.reduce(
              (max, m) => (new Date(m.timestamp) > max ? new Date(m.timestamp) : max),
              new Date(0),
            ),
          )
        : null;

      if (aLast && bLast) {
        return bLast - aLast;
      } else if (aLast && !bLast) {
        return -1;
      } else if (!aLast && bLast) {
        return 1;
      } else {
        return 0;
      }
    });

    return {
      contacts,
      totalItems: result.totalItems,
      totalPages: Math.ceil(result.totalItems / limit),
    };
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
  getAllContactsWithMessages,
  getMessagesByPhone,
};
