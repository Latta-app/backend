import ChatRepository from '../repositories/chat-history.repository.js';
import S3ClientUtil from '../../utils/s3.js';
import { normalizeQuery } from '../../utils/normalizeQuery.js';
import { isValidUUID } from '../../utils/validate.js';

const signMessagesMediaUrls = async (contacts) => {
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
  return contacts;
};

const attachReplyMessages = async (contacts) => {
  for (const contact of contacts) {
    for (const message of contact.chatHistory) {
      if (message.reply && isValidUUID(message.reply)) {
        const replyMessage = await ChatRepository.getReplyMessageById({ replyId: message.reply });
        if (replyMessage) {
          message.dataValues.replyMessage = replyMessage;
        }
      }
    }
  }
};

const getAllContactsWithMessages = async ({ clinic_id, page = 1, limit = 15 }) => {
  try {
    const result = await ChatRepository.getAllContactsWithMessages({ clinic_id, page, limit });
    const contacts = result.contacts;

    await attachReplyMessages(contacts);
    await signMessagesMediaUrls(contacts);

    return {
      contacts,
      totalItems: result.totalItems,
      totalPages: Math.ceil(result.totalItems / limit),
    };
  } catch (error) {
    throw new Error(`Service error: ${error.message}`);
  }
};

const searchContacts = async ({ clinic_id, query, page, limit }) => {
  try {
    const cleanedQuery = normalizeQuery(query);
    const hasLetter = /[a-zA-Z]/.test(cleanedQuery);

    const name = cleanedQuery && hasLetter ? cleanedQuery : null;
    const phone = cleanedQuery && !hasLetter ? cleanedQuery : null;

    const contacts = await ChatRepository.searchContacts({
      clinic_id,
      name,
      phone,
      page,
      limit,
    });

    await attachReplyMessages(contacts);
    await signMessagesMediaUrls(contacts);

    return contacts;
  } catch (error) {
    throw new Error(`Service error: ${error.message}`);
  }
};

export default {
  getAllContactsWithMessages,
  searchContacts,
};
