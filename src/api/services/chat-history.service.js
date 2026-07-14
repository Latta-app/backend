import ChatRepository from '../repositories/chat-history.repository.js';
import S3ClientUtil from '../../utils/s3.js';
import { normalizeQuery } from '../../utils/normalizeQuery.js';
import { isValidUUID } from '../../utils/validate.js';
import { isStagingPhone } from '../../utils/staging-users.helper.js';
import { ChatHistory, Contact } from '../models/index.js';

// ADR-0007 Fatia 7: guard de detail endpoints.
// Operador em environment=homolog so pode acessar contacts cujo cellphone
// esta na whitelist staging_users. Pra prod (default), passa sem check.
// Retorna true se o operador tem permissao de ver o contact em questao.
const canAccessContactInEnvironment = async (contact, environment) => {
  if (environment !== 'homolog') return true;
  if (!contact) return true; // null e' caso "not found", controller responde 404
  const cellphone = contact.cellphone || contact.dataValues?.cellphone;
  if (!cellphone) return false; // contact sem phone, blindar acesso em homolog
  return isStagingPhone(cellphone);
};

// ADR-0007 Fatia 7: em environment=homolog, o filtro de staging_users ja
// cobre o universo visivel. Os filtros testFilter/b2bFilter padroes ('exclude')
// colidem com staging_users quando phones do range test personas
// (5500000000XXX) estao na whitelist — o `id NOT IN (TEST_CONTACT_IDS)`
// derruba TODOS os contacts de staging.
// Solucao: pra homolog, neutralizar testFilter/b2bFilter ('none') a menos
// que o caller tenha pedido explicitamente um valor diferente do default.
const resolveTestB2bFiltersForEnvironment = (environment, testFilter, b2bFilter) => {
  if (environment !== 'homolog') {
    return { testFilter, b2bFilter };
  }
  return {
    testFilter: testFilter === 'exclude' ? 'none' : testFilter,
    b2bFilter: b2bFilter === 'exclude' ? 'none' : b2bFilter,
  };
};

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
  role,
  page = 1,
  limit = 15,
  user_id,
  filters = {},
  testFilter = 'exclude',
  b2bFilter = 'exclude',
  stagingFilter = 'none',
  environment = 'prod',
}) => {
  try {
    // A aba Testers ja define seu universo explicitamente (whitelist menos
    // personas sinteticas) e nao pode ser reescrita pelo ajuste de homolog —
    // senao em homolog o 'exclude' viraria 'none' e as personas voltariam.
    const filtersForEnv =
      stagingFilter === 'only'
        ? { testFilter, b2bFilter }
        : resolveTestB2bFiltersForEnvironment(environment, testFilter, b2bFilter);
    const result = await ChatRepository.getAllContactsWithMessages({
      role,
      page,
      limit,
      user_id,
      filters,
      testFilter: filtersForEnv.testFilter,
      b2bFilter: filtersForEnv.b2bFilter,
      stagingFilter,
      environment,
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
  role,
  page = 1,
  limit = 15,
  user_id,
  filters = {},
  environment = 'prod',
}) => {
  return getAllContactsWithMessages({
    role,
    page,
    limit,
    user_id,
    filters,
    testFilter: 'only',
    b2bFilter: 'none',
    environment,
  });
};

// Aba B2B: clínicas (chat path 'merchant-scheduling-agent|%')
const getAllB2bContacts = async ({
  role,
  page = 1,
  limit = 15,
  user_id,
  filters = {},
  environment = 'prod',
}) => {
  return getAllContactsWithMessages({
    role,
    page,
    limit,
    user_id,
    filters,
    testFilter: 'none',
    b2bFilter: 'only',
    environment,
  });
};

// Aba Testers: humanos reais na whitelist staging_users (socios testando em
// prod com o proprio numero). testFilter='exclude' tira as personas sinteticas
// que tambem vivem na whitelist — sobra so gente de verdade.
const getAllTesterContacts = async ({
  role,
  page = 1,
  limit = 15,
  user_id,
  filters = {},
  environment = 'prod',
}) => {
  return getAllContactsWithMessages({
    role,
    page,
    limit,
    user_id,
    filters,
    testFilter: 'exclude',
    b2bFilter: 'none',
    stagingFilter: 'only',
    environment,
  });
};

const getTestContactsCount = async ({ role, environment = 'prod' }) => {
  try {
    return await ChatRepository.getTestContactsCount({ role, environment });
  } catch (error) {
    throw new Error(`Service error: ${error.message}`);
  }
};

const getB2bContactsCount = async ({ role, environment = 'prod' }) => {
  try {
    return await ChatRepository.getB2bContactsCount({ role, environment });
  } catch (error) {
    throw new Error(`Service error: ${error.message}`);
  }
};

const getTesterContactsCount = async ({ role, environment = 'prod' }) => {
  try {
    return await ChatRepository.getTesterContactsCount({ role, environment });
  } catch (error) {
    throw new Error(`Service error: ${error.message}`);
  }
};

// Badge da Luma. Espelha getAllContactsBeingAttended — inclusive o
// resolveTestB2bFiltersForEnvironment, senao em homolog o badge excluiria as
// test personas que a listagem mostra.
const getInAttendanceContactsCount = async ({
  role,
  testFilter = 'exclude',
  b2bFilter = 'exclude',
  environment = 'prod',
} = {}) => {
  try {
    const filtersForEnv = resolveTestB2bFiltersForEnvironment(environment, testFilter, b2bFilter);
    return await ChatRepository.getInAttendanceContactsCount({
      role,
      testFilter: filtersForEnv.testFilter,
      b2bFilter: filtersForEnv.b2bFilter,
      environment,
    });
  } catch (error) {
    throw new Error(`Service error: ${error.message}`);
  }
};

const getAllContactsBeingAttended = async ({
  role,
  page = 1,
  limit = 15,
  user_id,
  filters = {},
  testFilter = 'exclude',
  b2bFilter = 'exclude',
  environment = 'prod',
}) => {
  try {
    const filtersForEnv = resolveTestB2bFiltersForEnvironment(environment, testFilter, b2bFilter);
    const result = await ChatRepository.getAllContactsBeingAttended({
      role,
      page,
      limit,
      user_id,
      filters,
      testFilter: filtersForEnv.testFilter,
      b2bFilter: filtersForEnv.b2bFilter,
      environment,
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

const searchContacts = async ({ query, page, limit, role, user_id, filters = {}, environment = 'prod' }) => {
  try {
    const cleanedQuery = normalizeQuery(query);
    const hasLetter = /[a-zA-Z]/.test(cleanedQuery);

    const name = cleanedQuery && hasLetter ? cleanedQuery : null;
    const phone = cleanedQuery && !hasLetter ? cleanedQuery : null;

    const contacts = await ChatRepository.searchContacts({
      name,
      phone,
      page,
      limit,
      role,
      user_id,
      filters,
      environment,
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
  after = null,
  environment = 'prod',
}) => {
  try {
    const result = await ChatRepository.getContactByPetOwnerId({
      pet_owner_id,
      role,
      page,
      limit,
      before,
      after,
    });

    if (!result.contact) {
      return null;
    }

    // ADR-0007 Fatia 7: guard de detail endpoints
    if (!(await canAccessContactInEnvironment(result.contact, environment))) {
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
  after = null,
  environment = 'prod',
}) => {
  try {
    const result = await ChatRepository.getContactByContactId({
      contact_id,
      role,
      page,
      limit,
      before,
      after,
    });

    if (!result.contact) {
      return null;
    }

    if (!(await canAccessContactInEnvironment(result.contact, environment))) {
      return null;
    }

    await attachReplyMessages([result.contact]);
    await signMessagesMediaUrls([result.contact]);

    return result;
  } catch (error) {
    throw new Error(`Service error: ${error.message}`);
  }
};

const getMessagesDaysSummary = async ({
  pet_owner_id = null,
  contact_id = null,
  role,
  environment = 'prod',
}) => {
  try {
    // Pra homolog: garantir que pet_owner_id/contact_id pertencem a um contact
    // staging antes de retornar dias. Caso contrario, retorna lista vazia
    // (como se nao tivesse mensagens) pra nao vazar metadata.
    if (environment === 'homolog') {
      const lookupWhere = contact_id ? { id: contact_id } : { pet_owner_id };
      const contact = await Contact.findOne({
        where: lookupWhere,
        attributes: ['id', 'cellphone'],
      });
      if (!(await canAccessContactInEnvironment(contact, environment))) {
        return { days: [], totalDays: 0, totalMessages: 0 };
      }
    }
    return await ChatRepository.getMessagesDaysSummary({ pet_owner_id, contact_id, role });
  } catch (error) {
    throw new Error(`Service error: ${error.message}`);
  }
};

const getOrdersByContactId = async ({ contact_id, page = 1, limit = 10, environment = 'prod' }) => {
  try {
    // Pra homolog: validar acesso ao contact antes de retornar orders.
    if (environment === 'homolog') {
      const contact = await Contact.findOne({
        where: { id: contact_id },
        attributes: ['id', 'cellphone'],
      });
      if (!(await canAccessContactInEnvironment(contact, environment))) {
        return {
          orders: [],
          pagination: { currentPage: page, limit, totalOrders: 0, hasMore: false, totalPages: 0 },
        };
      }
    }
    return await ChatRepository.getOrdersByContactId({ contact_id, page, limit });
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
  environment = 'prod',
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

    if (!(await canAccessContactInEnvironment(result.contact, environment))) {
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
  getContactByPetOwnerIdOrPhone,
  getAllTestContacts,
  getAllB2bContacts,
  getAllTesterContacts,
  getTestContactsCount,
  getB2bContactsCount,
  getTesterContactsCount,
  getInAttendanceContactsCount,
  markAsAnswered,
  getMessagesDaysSummary,
};
