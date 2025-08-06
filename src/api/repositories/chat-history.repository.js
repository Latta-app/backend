import { Sequelize } from 'sequelize';
import {
  ChatHistory,
  ChatHistoryContacts,
  Contact,
  Pet,
  PetBreed,
  PetFurLength,
  PetGender,
  PetOwner,
  PetOwnerTag,
  PetSize,
  PetSubscription,
  PetType,
  Template,
} from '../models/index.js';

const getAllContactsWithMessages = async ({
  clinic_id,
  role,
  page = 1,
  limit = 15,
  user_id,
  filters = {},
}) => {
  try {
    const offset = (page - 1) * limit;
    const { Op } = Sequelize;

    const shouldFilterLatta = role !== 'admin' && role !== 'superAdmin';
    const chatHistoryWhere = shouldFilterLatta ? { path: { [Op.ne]: 'latta' } } : {};

    // Condições de WHERE básicas (mantém a lógica original)
    let whereConditions = {
      clinic_id,
    };

    // Constrói os filtros condicionalmente
    const additionalConditions = [];

    // FILTRO DE TAGS - Condição OU entre as tags
    if (filters.tags && filters.tags.length > 0) {
      // Escape das tags para prevenir SQL injection
      const escapedTags = filters.tags.map((tag) => `'${tag.replace(/'/g, "''")}'`).join(',');
      additionalConditions.push({
        id: {
          [Op.in]: Sequelize.literal(`(
            SELECT DISTINCT c.id 
            FROM contacts c
            INNER JOIN pet_owners po ON c.pet_owner_id = po.id
            INNER JOIN pet_owner_tag_assignments pota ON po.id = pota.pet_owner_id
            WHERE pota.tag_id IN (${escapedTags})
            AND c.clinic_id = '${clinic_id}'
          )`),
        },
      });
    }

    // FILTRO DE RESPONSABILIDADE - Verifica se a mensagem mais recente é do usuário
    if (filters.responsibility) {
      additionalConditions.push({
        id: {
          [Op.in]: Sequelize.literal(`(
            SELECT c.id 
            FROM contacts c
            WHERE c.clinic_id = '${clinic_id}'
            AND EXISTS (
              SELECT 1 FROM chat_history ch1
              WHERE ch1.contact_id = c.id
              ${shouldFilterLatta ? `AND ch1.path != 'latta'` : ''}
              AND ch1.timestamp = (
                SELECT MAX(ch2.timestamp)
                FROM chat_history ch2
                WHERE ch2.contact_id = c.id
                ${shouldFilterLatta ? `AND ch2.path != 'latta'` : ''}
              )
              AND ch1.user_id = '${user_id}'
            )
          )`),
        },
      });
    }

    // FILTRO DE NÃO LIDAS - Verifica se a mensagem mais recente não foi respondida
    if (filters.unread) {
      additionalConditions.push({
        id: {
          [Op.in]: Sequelize.literal(`(
            SELECT c.id 
            FROM contacts c
            WHERE c.clinic_id = '${clinic_id}'
            AND EXISTS (
              SELECT 1 FROM chat_history ch1
              WHERE ch1.contact_id = c.id
              ${shouldFilterLatta ? `AND ch1.path != 'latta'` : ''}
              AND ch1.timestamp = (
                SELECT MAX(ch2.timestamp)
                FROM chat_history ch2
                WHERE ch2.contact_id = c.id
                ${shouldFilterLatta ? `AND ch2.path != 'latta'` : ''}
              )
              AND ch1.is_answered = false
            )
          )`),
        },
      });
    }

    // Aplica os filtros adicionais com lógica E
    if (additionalConditions.length > 0) {
      whereConditions = {
        ...whereConditions,
        [Op.and]: additionalConditions,
      };
    }

    const { count: totalItems, rows: contacts } = await Contact.findAndCountAll({
      where: whereConditions,
      limit,
      offset,
      distinct: true,
      order: [
        [
          Sequelize.literal(`(
            SELECT MAX(chat_history.timestamp)
            FROM chat_history
            WHERE chat_history.contact_id = "Contact".id
            ${shouldFilterLatta ? `AND chat_history.path != 'latta'` : ''}
          )`),
          'DESC',
        ],
        ['updated_at', 'DESC'],
        [{ model: ChatHistory, as: 'chatHistory' }, 'timestamp', 'ASC'],
      ],
      include: [
        {
          model: ChatHistory,
          as: 'chatHistory',
          where: chatHistoryWhere,
          attributes: [
            'id',
            'message',
            'sent_by',
            'sent_to',
            'role',
            'timestamp',
            'window_timestamp',
            'journey',
            'message_type',
            'date',
            'message_id',
            'midia_url',
            'midia_name',
            'reply',
            'path',
            'user_id',
            'is_answered',
            'template_id',
          ],
          required: true,
          order: [['timestamp', 'ASC']],
          include: [
            {
              model: ChatHistoryContacts,
              as: 'chatHistoryContacts',
              attributes: [
                'id',
                'contact_name',
                'cellphone',
                'contact_phone',
                'message_id',
                'created_at',
                'updated_at',
              ],
            },
            {
              model: Template,
              as: 'template',
              attributes: ['id', 'template_name', 'template_category', 'template_status'],
            },
          ],
        },
        {
          model: PetOwner,
          as: 'petOwner',
          attributes: [
            'id',
            'name',
            'email',
            'cell_phone',
            'cpf',
            'date_of_birth',
            'is_active',
            'created_at',
          ],
          include: [
            {
              model: Pet,
              as: 'pets',
              attributes: ['id', 'name', 'date_of_birthday', 'photo', 'pet_subscription_id'],
              through: { attributes: [] },
              where: { is_active: true },
              include: [
                { model: PetType, as: 'type', attributes: ['id', 'name', 'label'] },
                { model: PetBreed, as: 'breed', attributes: ['id', 'name', 'label'] },
                { model: PetGender, as: 'gender', attributes: ['id', 'name', 'label'] },
                { model: PetSize, as: 'size', attributes: ['id', 'name', 'label'] },
                { model: PetFurLength, as: 'furLength', attributes: ['id', 'name', 'label'] },
                { model: PetSubscription, as: 'subscription', attributes: ['id', 'name'] },
              ],
            },
            {
              model: PetOwnerTag,
              as: 'tags',
              attributes: ['id', 'name', 'label', 'color', 'is_active'],
              through: {
                attributes: ['assigned_at', 'user_id'],
              },
              order: [['name', 'ASC']],
              where: { is_active: true },
              required: false,
            },
          ],
        },
      ],
    });

    return {
      contacts,
      totalItems,
    };
  } catch (error) {
    throw new Error(`Repository error: ${error.message}`);
  }
};

const searchContacts = async ({
  clinic_id,
  name,
  phone,
  page = 1,
  limit = 15,
  role,
  user_id,
  filters = {},
}) => {
  try {
    const { Op } = Sequelize;
    const offset = (page - 1) * limit;

    const shouldFilterLatta = role !== 'admin' && role !== 'superAdmin';
    const chatHistoryWhere = shouldFilterLatta ? { path: { [Op.ne]: 'latta' } } : {};

    let finalConditions = [];

    if (phone) {
      finalConditions.push({ cellphone: { [Op.iLike]: `%${phone}%` } });
    }

    if (name) {
      const contactsWithPetOwner = await Contact.findAll({
        attributes: ['id'],
        include: [
          {
            model: PetOwner,
            as: 'petOwner',
            where: { name: { [Op.iLike]: `%${name}%` } },
            attributes: ['id'],
            required: true,
          },
        ],
      });

      const contactIds = contactsWithPetOwner.map((c) => c.id);

      const nameConditions = [{ profile_name: { [Op.iLike]: `%${name}%` } }];

      if (contactIds.length > 0) {
        nameConditions.push({ id: { [Op.in]: contactIds } });
      }

      finalConditions.push({ [Op.or]: nameConditions });
    }

    let whereConditions = {
      clinic_id,
      ...(finalConditions.length > 0 ? { [Op.or]: finalConditions } : {}),
    };

    // Aplica os filtros adicionais (mesma lógica do getAllContacts)
    const additionalConditions = [];

    // FILTRO DE TAGS - Condição OU entre as tags
    if (filters.tags && filters.tags.length > 0) {
      const escapedTags = filters.tags.map((tag) => `'${tag.replace(/'/g, "''")}'`).join(',');
      additionalConditions.push({
        id: {
          [Op.in]: Sequelize.literal(`(
            SELECT DISTINCT c.id 
            FROM contacts c
            INNER JOIN pet_owners po ON c.pet_owner_id = po.id
            INNER JOIN pet_owner_tag_assignments pota ON po.id = pota.pet_owner_id
            WHERE pota.tag_id IN (${escapedTags})
            AND c.clinic_id = '${clinic_id}'
          )`),
        },
      });
    }

    // FILTRO DE RESPONSABILIDADE - Verifica se a mensagem mais recente é do usuário
    if (filters.responsibility) {
      additionalConditions.push({
        id: {
          [Op.in]: Sequelize.literal(`(
            SELECT c.id 
            FROM contacts c
            WHERE c.clinic_id = '${clinic_id}'
            AND EXISTS (
              SELECT 1 FROM chat_history ch1
              WHERE ch1.contact_id = c.id
              ${shouldFilterLatta ? `AND ch1.path != 'latta'` : ''}
              AND ch1.timestamp = (
                SELECT MAX(ch2.timestamp)
                FROM chat_history ch2
                WHERE ch2.contact_id = c.id
                ${shouldFilterLatta ? `AND ch2.path != 'latta'` : ''}
              )
              AND ch1.user_id = '${user_id}'
            )
          )`),
        },
      });
    }

    // FILTRO DE NÃO LIDAS - Verifica se a mensagem mais recente não foi respondida
    if (filters.unread) {
      additionalConditions.push({
        id: {
          [Op.in]: Sequelize.literal(`(
            SELECT c.id 
            FROM contacts c
            WHERE c.clinic_id = '${clinic_id}'
            AND EXISTS (
              SELECT 1 FROM chat_history ch1
              WHERE ch1.contact_id = c.id
              ${shouldFilterLatta ? `AND ch1.path != 'latta'` : ''}
              AND ch1.timestamp = (
                SELECT MAX(ch2.timestamp)
                FROM chat_history ch2
                WHERE ch2.contact_id = c.id
                ${shouldFilterLatta ? `AND ch2.path != 'latta'` : ''}
              )
              AND ch1.is_answered = false
            )
          )`),
        },
      });
    }

    // Combina as condições de busca com os filtros
    if (additionalConditions.length > 0) {
      whereConditions = {
        [Op.and]: [
          whereConditions, // Condições de busca originais
          ...additionalConditions, // Filtros adicionais
        ],
      };
    }

    const contacts = await Contact.findAll({
      where: whereConditions,
      limit: parseInt(limit),
      offset: parseInt(offset),
      distinct: true, // Evita duplicatas com joins múltiplos
      order: [
        [
          Sequelize.literal(`(
            CASE
              WHEN EXISTS (
                SELECT 1 FROM chat_history
                WHERE chat_history.contact_id = "Contact".id
                ${shouldFilterLatta ? `AND chat_history.path != 'latta'` : ''}
              )
              THEN 0
              ELSE 1
            END
          )`),
          'ASC',
        ],
        [
          Sequelize.literal(`(
            SELECT MAX(chat_history.timestamp)
            FROM chat_history
            WHERE chat_history.contact_id = "Contact".id
            ${shouldFilterLatta ? `AND chat_history.path != 'latta'` : ''}
          )`),
          'DESC',
        ],
        ['updated_at', 'DESC'],
        [{ model: ChatHistory, as: 'chatHistory' }, 'timestamp', 'ASC'],
      ],
      include: [
        {
          model: ChatHistory,
          as: 'chatHistory',
          where: chatHistoryWhere,
          required: false, // DIFERENÇA: false para buscar TODOS os contatos, independente de ter mensagem
          attributes: [
            'id',
            'message',
            'sent_by',
            'sent_to',
            'role',
            'timestamp',
            'window_timestamp',
            'journey',
            'message_type',
            'date',
            'message_id',
            'midia_url',
            'midia_name',
            'reply',
            'path',
            'user_id',
            'is_answered',
            'template_id',
          ],
          order: [['timestamp', 'ASC']],
          include: [
            {
              model: ChatHistoryContacts,
              as: 'chatHistoryContacts',
              attributes: [
                'id',
                'contact_name',
                'cellphone',
                'contact_phone',
                'message_id',
                'created_at',
                'updated_at',
              ],
            },
            {
              model: Template,
              as: 'template',
              attributes: ['id', 'template_name', 'template_category', 'template_status'],
            },
          ],
        },
        {
          model: PetOwner,
          as: 'petOwner',
          attributes: [
            'id',
            'name',
            'email',
            'cell_phone',
            'cpf',
            'date_of_birth',
            'is_active',
            'created_at',
          ],
          include: [
            {
              model: Pet,
              as: 'pets',
              attributes: ['id', 'name', 'date_of_birthday', 'photo'],
              through: { attributes: [] },
              include: [
                { model: PetType, as: 'type', attributes: ['id', 'name', 'label'] },
                { model: PetBreed, as: 'breed', attributes: ['id', 'name', 'label'] },
                { model: PetGender, as: 'gender', attributes: ['id', 'name', 'label'] },
                { model: PetSize, as: 'size', attributes: ['id', 'name', 'label'] },
                { model: PetFurLength, as: 'furLength', attributes: ['id', 'name', 'label'] },
                { model: PetSubscription, as: 'subscription', attributes: ['id', 'name'] },
              ],
            },
            {
              model: PetOwnerTag,
              as: 'tags',
              attributes: ['id', 'name', 'label', 'color', 'is_active'],
              through: {
                attributes: ['assigned_at', 'user_id'],
              },
              order: [['name', 'ASC']],
              where: { is_active: true },
              required: false,
            },
          ],
        },
      ],
    });

    return contacts;
  } catch (error) {
    throw new Error(`Repository error: ${error.message}`);
  }
};

const getReplyMessageById = async ({ replyId }) => {
  if (!replyId) return null;

  return await ChatHistory.findOne({
    where: { id: replyId },
    attributes: [
      'id',
      'message',
      'sent_by',
      'sent_to',
      'timestamp',
      'message_type',
      'midia_url',
      'midia_name',
      'role',
    ],
    include: [
      {
        model: ChatHistoryContacts,
        as: 'chatHistoryContacts',
        attributes: ['contact_name', 'contact_phone'],
      },
      {
        model: Contact,
        as: 'contact',
        attributes: ['profile_name'],
        required: false,
        include: [
          {
            model: PetOwner,
            as: 'petOwner',
            attributes: ['name'],
            required: false,
          },
        ],
      },
    ],
  });
};

export default {
  getAllContactsWithMessages,
  searchContacts,
  getReplyMessageById,
};
