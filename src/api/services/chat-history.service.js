import ChatRepository from '../repositories/chat-history.repository.js';
import S3ClientUtil from '../../utils/s3.js';
import { normalizeQuery } from '../../utils/normalizeQuery.js';
import { isValidUUID } from '../../utils/validate.js';
import { ChatHistory, Contact } from '../models/index.js';

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

const getAllContactsWithMessages = async ({
  clinic_id,
  role,
  page = 1,
  limit = 15,
  user_id,
  filters = {},
  testFilter = 'exclude',
}) => {
  try {
    const result = await ChatRepository.getAllContactsWithMessages({
      clinic_id,
      role,
      page,
      limit,
      user_id,
      filters, // Repassa os filtros para o repository
      testFilter,
    });
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

const getAllTestContacts = async ({
  clinic_id,
  role,
  page = 1,
  limit = 15,
  user_id,
  filters = {},
}) => {
  return getAllContactsWithMessages({
    clinic_id,
    role,
    page,
    limit,
    user_id,
    filters,
    testFilter: 'only',
  });
};

const getTestContactsCount = async ({ clinic_id, role }) => {
  try {
    return await ChatRepository.getTestContactsCount({ clinic_id, role });
  } catch (error) {
    throw new Error(`Service error: ${error.message}`);
  }
};

const getAllContactsBeingAttended = async ({
  clinic_id,
  role,
  page = 1,
  limit = 15,
  user_id,
  filters = {},
}) => {
  try {
    const result = await ChatRepository.getAllContactsBeingAttended({
      clinic_id,
      role,
      page,
      limit,
      user_id,
      filters,
    });
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

const searchContacts = async ({ clinic_id, query, page, limit, role, user_id, filters = {} }) => {
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
      role,
      user_id,
      filters, // Repassa os filtros para o repository
    });

    await attachReplyMessages(contacts);
    await signMessagesMediaUrls(contacts);

    return contacts;
  } catch (error) {
    throw new Error(`Service error: ${error.message}`);
  }
};

const getContactByPetOwnerId = async ({
  pet_owner_id,
  role,
  page = 1,
  limit = 20,
  before = null,
}) => {
  try {
    const result = await ChatRepository.getContactByPetOwnerId({
      pet_owner_id,
      role,
      page,
      limit,
      before,
    });

    if (!result.contact) {
      return null;
    }

    // Aplica os mesmos tratamentos dos outros métodos
    await attachReplyMessages([result.contact]);
    await signMessagesMediaUrls([result.contact]);

    return result;
  } catch (error) {
    throw new Error(`Service error: ${error.message}`);
  }
};

const getContactByContactId = async ({
  contact_id,
  role,
  page = 1,
  limit = 20,
  before = null,
}) => {
  try {
    const result = await ChatRepository.getContactByContactId({
      contact_id,
      role,
      page,
      limit,
      before,
    });

    if (!result.contact) {
      return null;
    }

    await attachReplyMessages([result.contact]);
    await signMessagesMediaUrls([result.contact]);

    return result;
  } catch (error) {
    throw new Error(`Service error: ${error.message}`);
  }
};

const getMessagesDaysSummary = async ({ pet_owner_id = null, contact_id = null, role }) => {
  try {
    return await ChatRepository.getMessagesDaysSummary({ pet_owner_id, contact_id, role });
  } catch (error) {
    throw new Error(`Service error: ${error.message}`);
  }
};

const getOrdersByContactId = async ({ contact_id, page = 1, limit = 10 }) => {
  try {
    return await ChatRepository.getOrdersByContactId({ contact_id, page, limit });
  } catch (error) {
    throw new Error(`Service error: ${error.message}`);
  }
};

const getAllContactsMessagesWithNoFilters = async ({ page = 1, limit = 15 }) => {
  try {
    const result = await ChatRepository.getAllContactsMessagesWithNoFilters({
      page,
      limit,
    });

    // Corrigir - deve retornar contacts, não contact
    if (!result || !result.contacts) {
      return {
        contacts: [],
        totalItems: 0,
        totalPages: 0,
      };
    }

    // Aplica os mesmos tratamentos dos outros métodos
    await attachReplyMessages(result.contacts);
    await signMessagesMediaUrls(result.contacts);

    return {
      contacts: result.contacts,
      totalItems: result.totalItems,
      totalPages: Math.ceil(result.totalItems / limit),
    };
  } catch (error) {
    throw new Error(`Service error: ${error.message}`);
  }
};

const getContactByPetOwnerIdOrPhone = async ({
  pet_owner_id,
  contact,
  role,
  page = 1,
  limit = 20,
}) => {
  try {
    const result = await ChatRepository.getContactByPetOwnerIdOrPhone({
      pet_owner_id,
      contact,
      role,
      page,
      limit,
    });

    if (!result.contact) {
      return null;
    }

    await attachReplyMessages([result.contact]);
    await signMessagesMediaUrls([result.contact]);

    return result;
  } catch (error) {
    throw new Error(`Service error: ${error.message}`);
  }
};

// Marca todas mensagens não-respondidas de um contact como is_answered=true.
// Substitui o webhook N8n `is_answered` (workflow Lattinha - Webhooks Front).
//
// Aceita `cell_phone` (preferido — todo contact tem) ou `pet_owner_id`
// (fallback com lookup). Usar só pet_owner_id falha em contacts sem
// pet_owner vinculado (ex: leads sem pet ainda cadastrado), que é o caso
// MAIS COMUM quando o atendente abre uma conversa nova.
const markAsAnswered = async ({ pet_owner_id, cell_phone }) => {
  let cellphone = cell_phone;

  if (!cellphone && pet_owner_id) {
    if (!isValidUUID(pet_owner_id)) {
      throw new Error('pet_owner_id inválido');
    }
    const contact = await Contact.findOne({
      where: { pet_owner_id },
      attributes: ['cellphone'],
    });
    cellphone = contact?.cellphone;
  }

  if (!cellphone) {
    return { updated: 0, cellphone: null };
  }

  // validate: false é OBRIGATÓRIO aqui — o ChatHistoryModel tem o custom
  // validator `hasContactIdentifier` que exige cell_phone/contact_id/etc.
  // não-nulos. Em UPDATE batch o Sequelize roda os validators dos campos
  // sendo atualizados como se fosse criar uma row nova, então rejeita
  // (é o caso clássico do "ValidationError: Pelo menos um identificador
  // de contato deve ser fornecido"). Como aqui só tocamos is_answered, é
  // safe pular validators — nenhuma constraint do banco é riscada.
  const [updated] = await ChatHistory.update(
    { is_answered: true },
    {
      where: {
        cell_phone: cellphone,
        is_answered: false,
      },
      validate: false,
    },
  );

  return { updated, cellphone };
};

export default {
  getAllContactsWithMessages,
  getAllContactsBeingAttended,
  searchContacts,
  getContactByPetOwnerId,
  getContactByContactId,
  getOrdersByContactId,
  getAllContactsMessagesWithNoFilters,
  getContactByPetOwnerIdOrPhone,
  getAllTestContacts,
  getTestContactsCount,
  markAsAnswered,
  getMessagesDaysSummary,
};
