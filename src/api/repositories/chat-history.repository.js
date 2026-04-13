import { Sequelize } from 'sequelize';
import {
  ChatHistory,
  ChatHistoryContacts,
  Contact,
  Order,
  OrderItem,
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
  TemplateVariable,
  TemplateVariableType,
} from '../models/index.js';

// Telefones de test personas (scripts/test-onboarding-personas.ts): 55000000000XX
const TEST_PHONE_REGEX = '^5500000000[0-9]{3}$';
const buildTestPhoneFilter = (testFilter = 'exclude') => {
  if (testFilter === 'only') return `AND po.cell_phone ~ '${TEST_PHONE_REGEX}'`;
  if (testFilter === 'none') return '';
  return `AND (po.cell_phone IS NULL OR po.cell_phone !~ '${TEST_PHONE_REGEX}')`;
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
    const offset = (page - 1) * limit;
    const { Op } = Sequelize;

    const shouldFilterLatta = role !== 'admin' && role !== 'superAdmin';
    const chatHistoryWhere = shouldFilterLatta ? { path: { [Op.ne]: 'latta' } } : {};

    const testPhoneFilter = buildTestPhoneFilter(testFilter);

    // Filtro base: contatos da clínica QUE TÊM pelo menos uma chat_history.
    // O EXISTS substitui o antigo `required: true` no include de chatHistory,
    // que não funciona junto com `separate: true` (necessário para o limit
    // por contato funcionar corretamente).
    let whereConditions = {
      id: {
        [Op.in]: Sequelize.literal(`(
          SELECT DISTINCT c.id
          FROM contacts c
          INNER JOIN pet_owners po ON c.pet_owner_id = po.id
          INNER JOIN pet_owner_clinics poc ON po.id = poc.pet_owner_id
          WHERE poc.clinic_id = '${clinic_id}'
          ${testPhoneFilter}
          AND EXISTS (
            SELECT 1 FROM chat_history ch
            WHERE ch.contact_id = c.id
            ${shouldFilterLatta ? `AND ch.path != 'latta'` : ''}
          )
        )`),
      },
    };


    // Constrói os filtros condicionalmente
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
            INNER JOIN pet_owner_clinics poc ON po.id = poc.pet_owner_id
            INNER JOIN pet_owner_tag_assignments pota ON po.id = pota.pet_owner_id
            WHERE pota.tag_id IN (${escapedTags})
            AND poc.clinic_id = '${clinic_id}'
            ${testPhoneFilter}
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
            INNER JOIN pet_owners po ON c.pet_owner_id = po.id
            INNER JOIN pet_owner_clinics poc ON po.id = poc.pet_owner_id
            WHERE poc.clinic_id = '${clinic_id}'
            ${testPhoneFilter}
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
            INNER JOIN pet_owners po ON c.pet_owner_id = po.id
            INNER JOIN pet_owner_clinics poc ON po.id = poc.pet_owner_id
            WHERE poc.clinic_id = '${clinic_id}'
            ${testPhoneFilter}
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
      // Ordem do parent (contatos) por última timestamp via subquery raw.
      // Não usar ordem por coluna do include — quebra o `separate: true` abaixo.
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
      ],
      include: [
        {
          model: ChatHistory,
          as: 'chatHistory',
          // Limit per-parent via correlated subquery em vez de Sequelize limit:
          // mais rápido (1 query única) que separate:true (N+1 queries),
          // e funciona corretamente com o parent limit (sem o bug do JOIN).
          where: {
            ...chatHistoryWhere,
            id: {
              [Op.in]: Sequelize.literal(`(
                SELECT ch.id
                FROM chat_history ch
                WHERE ch.contact_id = "Contact".id
                ${shouldFilterLatta ? `AND ch.path != 'latta'` : ''}
                ORDER BY ch.timestamp DESC
                LIMIT 20
              )`),
            },
          },
          attributes: [
            'id',
            [Sequelize.fn('LEFT', Sequelize.col('chatHistory.message'), 8000), 'message'],
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
            'n8n_execution_id',
            'n8n_workflow_id',
          ],
          required: false,
          order: [['timestamp', 'DESC']],
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
              order: [['template_label', 'ASC']],
              attributes: [
                'id',
                'template_name',
                'template_label',
                'template_category',
                'template_status',
              ],
              include: [
                {
                  model: TemplateVariable,
                  as: 'variables',
                  attributes: [
                    'id',
                    'template_id',
                    'template_component_id',
                    'template_component_type_id',
                    'template_varible_type_id',
                    'variable_position',
                  ],
                  include: [
                    {
                      model: TemplateVariableType,
                      as: 'templateVariableType',
                      attributes: ['id', 'type', 'description', 'n8n_formula'],
                    },
                  ],
                },
              ],
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
              attributes: ['id', 'name', 'date_of_birthday', 'photo', 'photo_thumb', 'pet_subscription_id'],
              through: { attributes: [] },
              where: { is_active: true }, // ← MANTÉM O FILTRO
              required: false, // ← ADICIONA ESTA LINHA!
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
            {
              model: Order,
              as: 'orders',
              attributes: [
                'id',
                'marketplace_order_id',
                'created_at',
                'total',
                'current_status_name',
                'payment_method',
                'delivery_estimate',
              ],
              required: false,
              order: [['created_at', 'DESC']],
              include: [
                {
                  model: OrderItem,
                  as: 'items',
                  attributes: ['id', 'name', 'brand', 'category', 'sku', 'thumbnail_url'],
                  required: false,
                },
              ],
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
    console.error('❌ ERRO NA FUNÇÃO:', error.message);
    console.error('❌ STACK:', error.stack);
    throw new Error(`Repository error: ${error.message}`);
  }
};

const getAllContactsBeingAttended = async ({
  clinic_id,
  role,
  page = 1,
  limit = 15,
  user_id,
  filters = {},
  testFilter = 'exclude',
}) => {
  try {
    const offset = (page - 1) * limit;
    const { Op } = Sequelize;

    const shouldFilterLatta = role !== 'admin' && role !== 'superAdmin';
    const chatHistoryWhere = shouldFilterLatta ? { path: { [Op.ne]: 'latta' } } : {};
    const testPhoneFilter = buildTestPhoneFilter(testFilter);

    // Filtro base: contatos em atendimento na clínica QUE TÊM chat_history.
    // O EXISTS substitui o antigo `required: true` no include de chatHistory,
    // que não funciona com `separate: true` (necessário para o limit por contato).
    let whereConditions = {
      is_being_attended: true,
      id: {
        [Op.in]: Sequelize.literal(`(
          SELECT DISTINCT c.id
          FROM contacts c
          INNER JOIN pet_owners po ON c.pet_owner_id = po.id
          INNER JOIN pet_owner_clinics poc ON po.id = poc.pet_owner_id
          WHERE poc.clinic_id = '${clinic_id}'
          AND c.is_being_attended = true
          ${testPhoneFilter}
          AND EXISTS (
            SELECT 1 FROM chat_history ch
            WHERE ch.contact_id = c.id
            ${shouldFilterLatta ? `AND ch.path != 'latta'` : ''}
          )
        )`),
      },
    };


    // Constrói os filtros condicionalmente
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
            INNER JOIN pet_owner_clinics poc ON po.id = poc.pet_owner_id
            INNER JOIN pet_owner_tag_assignments pota ON po.id = pota.pet_owner_id
            WHERE pota.tag_id IN (${escapedTags})
            AND poc.clinic_id = '${clinic_id}'
            AND c.is_being_attended = true
            ${testPhoneFilter}
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
            INNER JOIN pet_owners po ON c.pet_owner_id = po.id
            INNER JOIN pet_owner_clinics poc ON po.id = poc.pet_owner_id
            WHERE poc.clinic_id = '${clinic_id}'
            AND c.is_being_attended = true
            ${testPhoneFilter}
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
            INNER JOIN pet_owners po ON c.pet_owner_id = po.id
            INNER JOIN pet_owner_clinics poc ON po.id = poc.pet_owner_id
            WHERE poc.clinic_id = '${clinic_id}'
            AND c.is_being_attended = true
            ${testPhoneFilter}
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
      ],
      include: [
        {
          model: ChatHistory,
          as: 'chatHistory',
          // Limit per-parent via correlated subquery — single query, sem N+1
          where: {
            ...chatHistoryWhere,
            id: {
              [Op.in]: Sequelize.literal(`(
                SELECT ch.id
                FROM chat_history ch
                WHERE ch.contact_id = "Contact".id
                ${shouldFilterLatta ? `AND ch.path != 'latta'` : ''}
                ORDER BY ch.timestamp DESC
                LIMIT 20
              )`),
            },
          },
          attributes: [
            'id',
            [Sequelize.fn('LEFT', Sequelize.col('chatHistory.message'), 8000), 'message'],
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
            'n8n_execution_id',
            'n8n_workflow_id',
          ],
          required: false,
          order: [['timestamp', 'DESC']],
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
              order: [['template_label', 'ASC']],
              attributes: [
                'id',
                'template_name',
                'template_label',
                'template_category',
                'template_status',
              ],
              include: [
                {
                  model: TemplateVariable,
                  as: 'variables',
                  attributes: [
                    'id',
                    'template_id',
                    'template_component_id',
                    'template_component_type_id',
                    'template_varible_type_id',
                    'variable_position',
                  ],
                  include: [
                    {
                      model: TemplateVariableType,
                      as: 'templateVariableType',
                      attributes: ['id', 'type', 'description', 'n8n_formula'],
                    },
                  ],
                },
              ],
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
              attributes: ['id', 'name', 'date_of_birthday', 'photo', 'photo_thumb', 'pet_subscription_id'],
              through: { attributes: [] },
              where: { is_active: true },
              required: false,
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
            {
              model: Order,
              as: 'orders',
              attributes: [
                'id',
                'marketplace_order_id',
                'created_at',
                'total',
                'current_status_name',
                'payment_method',
                'delivery_estimate',
              ],
              required: false,
              order: [['created_at', 'DESC']],
              include: [
                {
                  model: OrderItem,
                  as: 'items',
                  attributes: ['id', 'name', 'brand', 'category', 'sku', 'thumbnail_url'],
                  required: false,
                },
              ],
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
    console.error('❌ ERRO NA FUNÇÃO (BEING ATTENDED):', error.message);
    console.error('❌ STACK:', error.stack);
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
        [{ model: ChatHistory, as: 'chatHistory' }, 'timestamp', 'DESC'],
      ],
      include: [
        {
          model: ChatHistory,
          as: 'chatHistory',
          where: chatHistoryWhere,
          required: false,
          limit: 20,
          attributes: [
            'id',
            [Sequelize.fn('LEFT', Sequelize.col('chatHistory.message'), 8000), 'message'],
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
            'n8n_execution_id',
            'n8n_workflow_id',
          ],
          order: [['timestamp', 'DESC']],
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
              order: [['template_label', 'ASC']],
              attributes: [
                'id',
                'template_name',
                'template_label',
                'template_category',
                'template_status',
              ],
              include: [
                {
                  model: TemplateVariable,
                  as: 'variables',
                  attributes: [
                    'id',
                    'template_id',
                    'template_component_id',
                    'template_component_type_id',
                    'template_varible_type_id',
                    'variable_position',
                  ],
                  include: [
                    {
                      model: TemplateVariableType,
                      as: 'templateVariableType',
                      attributes: ['id', 'type', 'description', 'n8n_formula'],
                    },
                  ],
                },
              ],
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
            {
              model: Order,
              as: 'orders',
              attributes: [
                'id',
                'marketplace_order_id',
                'created_at',
                'total',
                'current_status_name',
                'payment_method',
                'delivery_estimate',
              ],
              required: false,
              order: [['created_at', 'DESC']],
              include: [
                {
                  model: OrderItem,
                  as: 'items',
                  attributes: ['id', 'name', 'brand', 'category', 'sku', 'thumbnail_url'],
                  required: false,
                },
              ],
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

const getContactByPetOwnerIdOrPhone = async ({
  pet_owner_id,
  contact,
  role,
  page = 1,
  limit = 20,
}) => {
  try {
    const { Op } = Sequelize;
    const offset = (page - 1) * limit;

    const shouldFilterLatta = role !== 'admin' && role !== 'superAdmin';
    const chatHistoryWhere = shouldFilterLatta ? { path: { [Op.ne]: 'latta' } } : {};


    // Define condição de busca baseado no que foi passado
    let whereConditions = {};
    if (pet_owner_id) {
      whereConditions.pet_owner_id = pet_owner_id;
    } else if (contact) {
      whereConditions.cellphone = contact;
    } else {
      throw new Error('É necessário informar pet_owner_id ou contact');
    }

    const contactResult = await Contact.findOne({
      where: whereConditions,
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
        [{ model: ChatHistory, as: 'chatHistory' }, 'timestamp', 'DESC'],
      ],
      include: [
        {
          model: ChatHistory,
          as: 'chatHistory',
          where: {
            ...chatHistoryWhere,
            id: {
              [Op.in]: Sequelize.literal(`(
                SELECT ch.id 
                FROM chat_history ch
                WHERE ch.contact_id = "Contact".id
                ${shouldFilterLatta ? `AND ch.path != 'latta'` : ''}
                ORDER BY ch.timestamp DESC
                LIMIT ${limit} OFFSET ${offset}
              )`),
            },
          },
          attributes: [
            'id',
            [Sequelize.fn('LEFT', Sequelize.col('chatHistory.message'), 8000), 'message'],
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
            'n8n_execution_id',
            'n8n_workflow_id',
          ],
          required: false,
          order: [['timestamp', 'DESC']],
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
              order: [['template_label', 'ASC']],
              attributes: [
                'id',
                'template_name',
                'template_label',
                'template_category',
                'template_status',
              ],
              include: [
                {
                  model: TemplateVariable,
                  as: 'variables',
                  attributes: [
                    'id',
                    'template_id',
                    'template_component_id',
                    'template_component_type_id',
                    'template_varible_type_id',
                    'variable_position',
                  ],
                  include: [
                    {
                      model: TemplateVariableType,
                      as: 'templateVariableType',
                      attributes: ['id', 'type', 'description', 'n8n_formula'],
                    },
                  ],
                },
              ],
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
              attributes: ['id', 'name', 'date_of_birthday', 'photo', 'photo_thumb', 'pet_subscription_id'],
              through: { attributes: [] },
              where: { is_active: true },
              required: false,
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
            {
              model: Order,
              as: 'orders',
              attributes: [
                'id',
                'marketplace_order_id',
                'created_at',
                'total',
                'current_status_name',
                'payment_method',
                'delivery_estimate',
              ],
              required: false,
              order: [['created_at', 'DESC']],
              include: [
                {
                  model: OrderItem,
                  as: 'items',
                  attributes: ['id', 'name', 'brand', 'category', 'sku', 'thumbnail_url'],
                  required: false,
                },
              ],
            },
          ],
        },
      ],
    });

    let totalMessages = 0;
    if (contactResult) {
      const totalResult = await ChatHistory.count({
        where: {
          contact_id: contactResult.id,
          ...chatHistoryWhere,
        },
      });
      totalMessages = totalResult;
    }

    const result = {
      contact: contactResult,
      pagination: {
        currentPage: page,
        limit,
        totalMessages,
        hasMore: totalMessages > page * limit,
        totalPages: Math.ceil(totalMessages / limit),
      },
    };


    return result;
  } catch (error) {
    console.error('❌ ERRO NA FUNÇÃO getContactByPetOwnerIdOrPhone:', error.message);
    console.error('❌ STACK:', error.stack);
    throw new Error(`Repository error: ${error.message}`);
  }
};

const getContactByPetOwnerId = async ({ pet_owner_id, role, page = 1, limit = 20 }) => {
  try {
    const { Op } = Sequelize;
    const offset = (page - 1) * limit;

    const shouldFilterLatta = role !== 'admin' && role !== 'superAdmin';
    const chatHistoryWhere = shouldFilterLatta ? { path: { [Op.ne]: 'latta' } } : {};


    const whereConditions = {
      pet_owner_id: pet_owner_id,
    };

    const contact = await Contact.findOne({
      where: whereConditions,
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
        [{ model: ChatHistory, as: 'chatHistory' }, 'timestamp', 'DESC'],
      ],
      include: [
        {
          model: ChatHistory,
          as: 'chatHistory',
          where: {
            ...chatHistoryWhere,
            id: {
              [Op.in]: Sequelize.literal(`(
                SELECT ch.id 
                FROM chat_history ch
                WHERE ch.contact_id = "Contact".id
                ${shouldFilterLatta ? `AND ch.path != 'latta'` : ''}
                ORDER BY ch.timestamp DESC
                LIMIT ${limit} OFFSET ${offset}
              )`),
            },
          },
          attributes: [
            'id',
            [Sequelize.fn('LEFT', Sequelize.col('chatHistory.message'), 8000), 'message'],
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
            'n8n_execution_id',
            'n8n_workflow_id',
          ],
          required: false,
          order: [['timestamp', 'DESC']],
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
              order: [['template_label', 'ASC']],
              attributes: [
                'id',
                'template_name',
                'template_label',
                'template_category',
                'template_status',
              ],
              include: [
                {
                  model: TemplateVariable,
                  as: 'variables',
                  attributes: [
                    'id',
                    'template_id',
                    'template_component_id',
                    'template_component_type_id',
                    'template_varible_type_id',
                    'variable_position',
                  ],
                  include: [
                    {
                      model: TemplateVariableType,
                      as: 'templateVariableType',
                      attributes: ['id', 'type', 'description', 'n8n_formula'],
                    },
                  ],
                },
              ],
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
              attributes: ['id', 'name', 'date_of_birthday', 'photo', 'photo_thumb', 'pet_subscription_id'],
              through: { attributes: [] },
              where: { is_active: true },
              required: false,
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

    // Contar total de mensagens para saber se há mais páginas
    let totalMessages = 0;
    if (contact) {
      const totalResult = await ChatHistory.count({
        where: {
          contact_id: contact.id,
          ...chatHistoryWhere,
        },
      });
      totalMessages = totalResult;
    }

    const result = {
      contact,
      pagination: {
        currentPage: page,
        limit,
        totalMessages,
        hasMore: totalMessages > page * limit,
        totalPages: Math.ceil(totalMessages / limit),
      },
    };


    return result;
  } catch (error) {
    console.error('❌ ERRO NA FUNÇÃO getContactByPetOwnerId:', error.message);
    console.error('❌ STACK:', error.stack);
    throw new Error(`Repository error: ${error.message}`);
  }
};

const getAllContactsMessagesWithNoFilters = async ({ page = 1, limit = 20 }) => {
  try {
    const offset = (page - 1) * limit;
    const { Op } = Sequelize;

    // Exclui test personas (55000000000XX) mesmo no modo "sem filtros" —
    // elas têm sua própria aba "Testes" no frontend e poluem a visualização
    // quando misturadas aos contatos reais.
    const testPersonaExcludeWhere = {
      id: {
        [Op.notIn]: Sequelize.literal(`(
          SELECT c.id FROM contacts c
          INNER JOIN pet_owners po ON c.pet_owner_id = po.id
          WHERE po.cell_phone ~ '${TEST_PHONE_REGEX}'
        )`),
      },
    };

    const { count: totalItems, rows: contacts } = await Contact.findAndCountAll({
      where: testPersonaExcludeWhere,
      limit,
      offset,
      distinct: true,
      order: [
        [
          Sequelize.literal(`(
            SELECT MAX(chat_history.timestamp)
            FROM chat_history
            WHERE chat_history.contact_id = "Contact".id
          )`),
          'DESC NULLS LAST',
        ],
        ['updated_at', 'DESC'],
      ],
      include: [
        {
          model: ChatHistory,
          as: 'chatHistory',
          // 🎯 SOLUÇÃO: Subquery para limitar a 15 mensagens mais recentes por contato
          where: {
            id: {
              [Op.in]: Sequelize.literal(`(
                SELECT ch.id 
                FROM chat_history ch
                WHERE ch.contact_id = "Contact".id
                ORDER BY ch.timestamp DESC
                LIMIT 15
              )`),
            },
          },
          attributes: [
            'id',
            [Sequelize.fn('LEFT', Sequelize.col('chatHistory.message'), 8000), 'message'],
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
            'n8n_execution_id',
            'n8n_workflow_id',
          ],
          required: false, // false para incluir contatos sem mensagens também
          order: [['timestamp', 'DESC']],
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
              required: false,
            },
            {
              model: Template,
              as: 'template',
              attributes: [
                'id',
                'template_name',
                'template_label',
                'template_category',
                'template_status',
              ],
              required: false,
              include: [
                {
                  model: TemplateVariable,
                  as: 'variables',
                  attributes: [
                    'id',
                    'template_id',
                    'template_component_id',
                    'template_component_type_id',
                    'template_varible_type_id',
                    'variable_position',
                  ],
                  required: false,
                  include: [
                    {
                      model: TemplateVariableType,
                      as: 'templateVariableType',
                      attributes: ['id', 'type', 'description', 'n8n_formula'],
                      required: false,
                    },
                  ],
                },
              ],
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
          required: false,
          include: [
            {
              model: Pet,
              as: 'pets',
              attributes: ['id', 'name', 'date_of_birthday', 'photo', 'photo_thumb', 'pet_subscription_id'],
              through: { attributes: [] },
              where: { is_active: true },
              required: false,
              include: [
                {
                  model: PetType,
                  as: 'type',
                  attributes: ['id', 'name', 'label'],
                  required: false,
                },
                {
                  model: PetBreed,
                  as: 'breed',
                  attributes: ['id', 'name', 'label'],
                  required: false,
                },
                {
                  model: PetGender,
                  as: 'gender',
                  attributes: ['id', 'name', 'label'],
                  required: false,
                },
                {
                  model: PetSize,
                  as: 'size',
                  attributes: ['id', 'name', 'label'],
                  required: false,
                },
                {
                  model: PetFurLength,
                  as: 'furLength',
                  attributes: ['id', 'name', 'label'],
                  required: false,
                },
                {
                  model: PetSubscription,
                  as: 'subscription',
                  attributes: ['id', 'name'],
                  required: false,
                },
              ],
            },
            {
              model: PetOwnerTag,
              as: 'tags',
              attributes: ['id', 'name', 'label', 'color', 'is_active'],
              through: {
                attributes: ['assigned_at', 'user_id'],
              },
              where: { is_active: true },
              required: false,
            },
            {
              model: Order,
              as: 'orders',
              attributes: [
                'id',
                'marketplace_order_id',
                'created_at',
                'total',
                'current_status_name',
                'payment_method',
                'delivery_estimate',
              ],
              required: false,
              order: [['created_at', 'DESC']],
              include: [
                {
                  model: OrderItem,
                  as: 'items',
                  attributes: ['id', 'name', 'brand', 'category', 'sku', 'thumbnail_url'],
                  required: false,
                },
              ],
            },
          ],
        },
      ],
    });


    // 📊 Debug detalhado das mensagens por contato
    let totalMessages = 0;
    contacts.forEach((contact, index) => {
      const messageCount = contact.chatHistory ? contact.chatHistory.length : 0;
      totalMessages += messageCount;
      console.log(`📱 Contato ${index + 1} (ID: ${contact.id}): ${messageCount} mensagens`);

      // Log do pet owner se existir
      if (contact.petOwner) {
        console.log(`   👤 Pet Owner: ${contact.petOwner.name} (${contact.petOwner.cell_phone})`);
      }
    });

    console.log(
      `📈 PERFORMANCE: ${totalMessages} mensagens carregadas no total (máximo ${limit * 15})`,
    );
    console.log(
      `⚡ Economia: ${limit * 15 - totalMessages} mensagens não carregadas desnecessariamente`,
    );

    // 🔄 Ordenar as mensagens de cada contato por timestamp DESC (mais recente primeiro)
    const processedContacts = contacts.map((contact) => {
      if (contact.chatHistory && contact.chatHistory.length > 0) {
        contact.chatHistory.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
      }
      return contact;
    });

    return {
      contacts: processedContacts,
      totalItems,
      metadata: {
        page: parseInt(page),
        limit: parseInt(limit),
        offset,
        totalPages: Math.ceil(totalItems / limit),
        totalMessagesLoaded: totalMessages,
        maxPossibleMessages: limit * 15,
        hasNextPage: page * limit < totalItems,
        hasPreviousPage: page > 1,
      },
    };
  } catch (error) {
    console.error('❌ ERRO NA FUNÇÃO getAllContactsMessagesWithNoFilters:', error.message);
    console.error('❌ STACK TRACE:', error.stack);

    // Log adicional para debug — offset pode não estar em escopo se o erro
    // ocorreu antes da declaração `const offset = ...` dentro do try.
    console.error('❌ PARÂMETROS:', { page, limit });

    throw new Error(`Repository error: ${error.message}`);
  }
};

const getTestContactsCount = async ({ clinic_id, role }) => {
  try {
    const shouldFilterLatta = role !== 'admin' && role !== 'superAdmin';

    const [result] = await Contact.sequelize.query(
      `
      SELECT COUNT(DISTINCT c.id)::int AS count
      FROM contacts c
      INNER JOIN pet_owners po ON c.pet_owner_id = po.id
      INNER JOIN pet_owner_clinics poc ON po.id = poc.pet_owner_id
      WHERE poc.clinic_id = :clinic_id
      AND po.cell_phone ~ :test_phone_regex
      AND EXISTS (
        SELECT 1 FROM chat_history ch
        WHERE ch.contact_id = c.id
        ${shouldFilterLatta ? `AND ch.path != 'latta'` : ''}
      )
      `,
      {
        replacements: { clinic_id, test_phone_regex: TEST_PHONE_REGEX },
        type: Sequelize.QueryTypes.SELECT,
      },
    );

    return { count: result?.count || 0 };
  } catch (error) {
    console.error('❌ ERRO getTestContactsCount:', error.message);
    throw new Error(`Repository error: ${error.message}`);
  }
};

export default {
  getAllContactsWithMessages,
  getAllContactsBeingAttended,
  searchContacts,
  getReplyMessageById,
  getContactByPetOwnerId,
  getContactByPetOwnerIdOrPhone,
  getAllContactsMessagesWithNoFilters,
  getTestContactsCount,
};
