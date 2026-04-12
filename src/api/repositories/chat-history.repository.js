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

const getAllContactsWithMessages = async ({
  clinic_id,
  role,
  page = 1,
  limit = 15,
  user_id,
  filters = {},
}) => {
  console.log('clinic_id', clinic_id);
  try {
    const offset = (page - 1) * limit;
    const { Op } = Sequelize;

    const shouldFilterLatta = role !== 'admin' && role !== 'superAdmin';
    const chatHistoryWhere = shouldFilterLatta ? { path: { [Op.ne]: 'latta' } } : {};

    // INÍCIO DO DEBUG INTEGRADO
    console.log('🔍 === INVESTIGAÇÃO DETALHADA DO CHAT HISTORY ===');
    console.log('🔍 clinic_id:', clinic_id);
    console.log('🔍 shouldFilterLatta:', shouldFilterLatta);

    // Primeiro, vamos pegar os IDs dos contatos
    const basicContactsQuery = `
      SELECT DISTINCT c.id, c.pet_owner_id, po.name 
      FROM contacts c
      INNER JOIN pet_owners po ON c.pet_owner_id = po.id
      INNER JOIN pet_owner_clinics poc ON po.id = poc.pet_owner_id
      WHERE poc.clinic_id = '${clinic_id}'
    `;

    const basicContacts = await Contact.sequelize.query(basicContactsQuery, {
      type: Contact.sequelize.QueryTypes.SELECT,
    });

    if (basicContacts.length === 0) {
      console.log('❌ Nenhum contato encontrado para essa clínica');
      return { contacts: [], totalItems: 0 };
    }

    const contactIds = basicContacts.map((c) => c.id);
    console.log('🔍 Contact IDs encontrados:', contactIds);

    // TESTE: Verificar chat_history para esses contatos
    const allChatHistory = await Contact.sequelize.query(
      `
      SELECT 
        ch.contact_id,
        ch.path,
        ch.message,
        ch.timestamp,
        ch.sent_by,
        ch.role,
        COUNT(*) OVER (PARTITION BY ch.contact_id) as total_messages
      FROM chat_history ch 
      WHERE ch.contact_id IN ('${contactIds.join("','")}')
      ORDER BY ch.contact_id, ch.timestamp DESC
      LIMIT 10
    `,
      {
        type: Contact.sequelize.QueryTypes.SELECT,
      },
    );

    console.log('🔍 Chat history encontrado:', allChatHistory.length, 'mensagens');

    if (allChatHistory.length > 0) {
      // Mostrar detalhes das mensagens
      console.log('🔍 Exemplo de mensagens:');
      allChatHistory.slice(0, 3).forEach((msg) => {
        console.log(
          `- Contact ${msg.contact_id}: path="${msg.path}", message="${msg.message?.substring(
            0,
            30,
          )}..."`,
        );
      });

      // Verificar paths únicos
      const uniquePaths = [...new Set(allChatHistory.map((m) => m.path))];
      console.log('🔍 Paths únicos encontrados:', uniquePaths);

      // Se shouldFilterLatta = true, ver quantas sobram
      if (shouldFilterLatta) {
        const nonLattaMessages = allChatHistory.filter((m) => m.path !== 'latta');
        console.log('🔍 Mensagens após filtrar "latta":', nonLattaMessages.length);

        if (nonLattaMessages.length === 0) {
          console.log('❌ PROBLEMA ENCONTRADO: Todas as mensagens têm path = "latta"!');
          console.log('❌ Como o role não é admin/superAdmin, elas estão sendo filtradas.');
        }
      }
    } else {
      console.log('❌ NENHUMA mensagem encontrada nos chat_history para esses contatos!');
    }

    // Teste direto com Sequelize
    console.log('🔍 Testando include do Sequelize...');
    try {
      const sequelizeTest = await Contact.findAll({
        where: {
          id: { [Op.in]: contactIds },
        },
        include: [
          {
            model: ChatHistory,
            as: 'chatHistory',
            where: chatHistoryWhere,
            required: true,
            attributes: ['id', 'message', 'path', 'timestamp'],
          },
        ],
        limit: 2,
      });

      console.log('🔍 Sequelize test result:', sequelizeTest.length, 'contatos encontrados');
      if (sequelizeTest.length === 0) {
        console.log('❌ O include do ChatHistory está falhando!');
      }
    } catch (error) {
      console.log('❌ Erro no teste Sequelize:', error.message);
    }
    // FIM DO DEBUG INTEGRADO

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
          AND EXISTS (
            SELECT 1 FROM chat_history ch
            WHERE ch.contact_id = c.id
            ${shouldFilterLatta ? `AND ch.path != 'latta'` : ''}
          )
        )`),
      },
    };

    console.log('🔍 whereConditions inicial:', JSON.stringify(whereConditions, null, 2));

    // Constrói os filtros condicionalmente
    const additionalConditions = [];

    // FILTRO DE TAGS - Condição OU entre as tags
    if (filters.tags && filters.tags.length > 0) {
      console.log('🔍 Aplicando filtro de tags:', filters.tags);
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
          )`),
        },
      });
    }

    // FILTRO DE RESPONSABILIDADE - Verifica se a mensagem mais recente é do usuário
    if (filters.responsibility) {
      console.log('🔍 Aplicando filtro de responsabilidade para user_id:', user_id);
      additionalConditions.push({
        id: {
          [Op.in]: Sequelize.literal(`(
            SELECT c.id 
            FROM contacts c
            INNER JOIN pet_owners po ON c.pet_owner_id = po.id
            INNER JOIN pet_owner_clinics poc ON po.id = poc.pet_owner_id
            WHERE poc.clinic_id = '${clinic_id}'
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
      console.log('🔍 Aplicando filtro de não lidas');
      additionalConditions.push({
        id: {
          [Op.in]: Sequelize.literal(`(
            SELECT c.id 
            FROM contacts c
            INNER JOIN pet_owners po ON c.pet_owner_id = po.id
            INNER JOIN pet_owner_clinics poc ON po.id = poc.pet_owner_id
            WHERE poc.clinic_id = '${clinic_id}'
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
      console.log('🔍 Aplicando', additionalConditions.length, 'filtros adicionais');
      whereConditions = {
        ...whereConditions,
        [Op.and]: additionalConditions,
      };
    }

    console.log('🔍 whereConditions final:', JSON.stringify(whereConditions, null, 2));

    // TESTE 3: Executar uma consulta simplificada primeiro
    try {
      const simplifiedQuery = await Contact.findAll({
        where: {
          id: {
            [Op.in]: Sequelize.literal(`(
              SELECT DISTINCT c.id 
              FROM contacts c
              INNER JOIN pet_owners po ON c.pet_owner_id = po.id
              INNER JOIN pet_owner_clinics poc ON po.id = poc.pet_owner_id
              WHERE poc.clinic_id = '${clinic_id}'
            )`),
          },
        },
        attributes: ['id', 'pet_owner_id'],
        limit: 5,
      });

      console.log(
        '🔍 TESTE 3 - Contatos encontrados na consulta simplificada:',
        simplifiedQuery.length,
      );
      console.log(
        '🔍 TESTE 3 - IDs:',
        simplifiedQuery.map((c) => c.id),
      );
    } catch (err) {
      console.error('❌ TESTE 3 - Erro na consulta simplificada:', err.message);
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

    console.log('🔍 RESULTADO FINAL:', contacts.length, 'contatos retornados');

    // DEBUG ADICIONAL: Vamos testar step by step o que está quebrando
    if (contacts.length === 0 && totalItems > 0) {
      console.log('🔍 === INVESTIGAÇÃO DA CONSULTA COMPLEXA ===');

      // Teste 1: Apenas o where básico + ChatHistory simples
      try {
        const test1 = await Contact.findAll({
          where: whereConditions,
          include: [
            {
              model: ChatHistory,
              as: 'chatHistory',
              where: chatHistoryWhere,
              required: true,
              attributes: ['id', 'message', 'path'],
            },
          ],
          limit: 2,
        });
        console.log('🔍 TESTE 1 - ChatHistory simples:', test1.length, 'contatos');
      } catch (err) {
        console.log('❌ TESTE 1 - Erro:', err.message);
      }

      // Teste 2: Adicionar o PetOwner
      try {
        const test2 = await Contact.findAll({
          where: whereConditions,
          include: [
            {
              model: ChatHistory,
              as: 'chatHistory',
              where: chatHistoryWhere,
              required: true,
              attributes: ['id', 'message', 'path'],
            },
            {
              model: PetOwner,
              as: 'petOwner',
              attributes: ['id', 'name'],
            },
          ],
          limit: 2,
        });
        console.log('🔍 TESTE 2 - Com PetOwner:', test2.length, 'contatos');
      } catch (err) {
        console.log('❌ TESTE 2 - Erro:', err.message);
      }

      // Teste 3: Verificar se é o order que está quebrando
      try {
        const test3 = await Contact.findAll({
          where: whereConditions,
          include: [
            {
              model: ChatHistory,
              as: 'chatHistory',
              where: chatHistoryWhere,
              required: true,
              attributes: ['id', 'message', 'path', 'timestamp'],
            },
          ],
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
          ],
          limit: 2,
        });
        console.log('🔍 TESTE 3 - Com ORDER BY:', test3.length, 'contatos');
      } catch (err) {
        console.log('❌ TESTE 3 - Erro ORDER BY:', err.message);
      }

      // Teste 4: Verificar se são os includes aninhados do ChatHistory
      try {
        const test4 = await Contact.findAll({
          where: whereConditions,
          include: [
            {
              model: ChatHistory,
              as: 'chatHistory',
              where: chatHistoryWhere,
              required: true,
              attributes: ['id', 'message', 'path', 'template_id'],
              include: [
                {
                  model: Template,
                  as: 'template',
                  attributes: ['id', 'template_name'],
                  required: false,
                },
              ],
            },
          ],
          limit: 2,
        });
        console.log('🔍 TESTE 4 - Com Template include:', test4.length, 'contatos');
      } catch (err) {
        console.log('❌ TESTE 4 - Erro Template:', err.message);
      }
    }

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
}) => {
  console.log('clinic_id', clinic_id);
  try {
    const offset = (page - 1) * limit;
    const { Op } = Sequelize;

    const shouldFilterLatta = role !== 'admin' && role !== 'superAdmin';
    const chatHistoryWhere = shouldFilterLatta ? { path: { [Op.ne]: 'latta' } } : {};

    // INÍCIO DO DEBUG INTEGRADO
    console.log('🔍 === INVESTIGAÇÃO DETALHADA DO CHAT HISTORY (BEING ATTENDED) ===');
    console.log('🔍 clinic_id:', clinic_id);
    console.log('🔍 shouldFilterLatta:', shouldFilterLatta);

    // Primeiro, vamos pegar os IDs dos contatos que estão sendo atendidos
    const basicContactsQuery = `
      SELECT DISTINCT c.id, c.pet_owner_id, po.name 
      FROM contacts c
      INNER JOIN pet_owners po ON c.pet_owner_id = po.id
      INNER JOIN pet_owner_clinics poc ON po.id = poc.pet_owner_id
      WHERE poc.clinic_id = '${clinic_id}'
      AND c.is_being_attended = true
    `;

    const basicContacts = await Contact.sequelize.query(basicContactsQuery, {
      type: Contact.sequelize.QueryTypes.SELECT,
    });

    if (basicContacts.length === 0) {
      console.log('❌ Nenhum contato sendo atendido encontrado para essa clínica');
      return { contacts: [], totalItems: 0 };
    }

    const contactIds = basicContacts.map((c) => c.id);
    console.log('🔍 Contact IDs sendo atendidos encontrados:', contactIds);

    // TESTE: Verificar chat_history para esses contatos
    const allChatHistory = await Contact.sequelize.query(
      `
      SELECT 
        ch.contact_id,
        ch.path,
        ch.message,
        ch.timestamp,
        ch.sent_by,
        ch.role,
        COUNT(*) OVER (PARTITION BY ch.contact_id) as total_messages
      FROM chat_history ch 
      WHERE ch.contact_id IN ('${contactIds.join("','")}')
      ORDER BY ch.contact_id, ch.timestamp DESC
      LIMIT 10
    `,
      {
        type: Contact.sequelize.QueryTypes.SELECT,
      },
    );

    console.log('🔍 Chat history encontrado:', allChatHistory.length, 'mensagens');

    if (allChatHistory.length > 0) {
      // Mostrar detalhes das mensagens
      console.log('🔍 Exemplo de mensagens:');
      allChatHistory.slice(0, 3).forEach((msg) => {
        console.log(
          `- Contact ${msg.contact_id}: path="${msg.path}", message="${msg.message?.substring(
            0,
            30,
          )}..."`,
        );
      });

      // Verificar paths únicos
      const uniquePaths = [...new Set(allChatHistory.map((m) => m.path))];
      console.log('🔍 Paths únicos encontrados:', uniquePaths);

      // Se shouldFilterLatta = true, ver quantas sobram
      if (shouldFilterLatta) {
        const nonLattaMessages = allChatHistory.filter((m) => m.path !== 'latta');
        console.log('🔍 Mensagens após filtrar "latta":', nonLattaMessages.length);

        if (nonLattaMessages.length === 0) {
          console.log('❌ PROBLEMA ENCONTRADO: Todas as mensagens têm path = "latta"!');
          console.log('❌ Como o role não é admin/superAdmin, elas estão sendo filtradas.');
        }
      }
    } else {
      console.log('❌ NENHUMA mensagem encontrada nos chat_history para esses contatos!');
    }

    // Teste direto com Sequelize
    console.log('🔍 Testando include do Sequelize...');
    try {
      const sequelizeTest = await Contact.findAll({
        where: {
          id: { [Op.in]: contactIds },
          is_being_attended: true, // FILTRO ADICIONAL
        },
        include: [
          {
            model: ChatHistory,
            as: 'chatHistory',
            where: chatHistoryWhere,
            required: true,
            attributes: ['id', 'message', 'path', 'timestamp'],
          },
        ],
        limit: 2,
      });

      console.log('🔍 Sequelize test result:', sequelizeTest.length, 'contatos encontrados');
      if (sequelizeTest.length === 0) {
        console.log('❌ O include do ChatHistory está falhando!');
      }
    } catch (error) {
      console.log('❌ Erro no teste Sequelize:', error.message);
    }
    // FIM DO DEBUG INTEGRADO

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
          AND EXISTS (
            SELECT 1 FROM chat_history ch
            WHERE ch.contact_id = c.id
            ${shouldFilterLatta ? `AND ch.path != 'latta'` : ''}
          )
        )`),
      },
    };

    console.log('🔍 whereConditions inicial:', JSON.stringify(whereConditions, null, 2));

    // Constrói os filtros condicionalmente
    const additionalConditions = [];

    // FILTRO DE TAGS - Condição OU entre as tags
    if (filters.tags && filters.tags.length > 0) {
      console.log('🔍 Aplicando filtro de tags:', filters.tags);
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
          )`),
        },
      });
    }

    // FILTRO DE RESPONSABILIDADE - Verifica se a mensagem mais recente é do usuário
    if (filters.responsibility) {
      console.log('🔍 Aplicando filtro de responsabilidade para user_id:', user_id);
      additionalConditions.push({
        id: {
          [Op.in]: Sequelize.literal(`(
            SELECT c.id 
            FROM contacts c
            INNER JOIN pet_owners po ON c.pet_owner_id = po.id
            INNER JOIN pet_owner_clinics poc ON po.id = poc.pet_owner_id
            WHERE poc.clinic_id = '${clinic_id}'
            AND c.is_being_attended = true
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
      console.log('🔍 Aplicando filtro de não lidas');
      additionalConditions.push({
        id: {
          [Op.in]: Sequelize.literal(`(
            SELECT c.id 
            FROM contacts c
            INNER JOIN pet_owners po ON c.pet_owner_id = po.id
            INNER JOIN pet_owner_clinics poc ON po.id = poc.pet_owner_id
            WHERE poc.clinic_id = '${clinic_id}'
            AND c.is_being_attended = true
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
      console.log('🔍 Aplicando', additionalConditions.length, 'filtros adicionais');
      whereConditions = {
        ...whereConditions,
        [Op.and]: additionalConditions,
      };
    }

    console.log('🔍 whereConditions final:', JSON.stringify(whereConditions, null, 2));

    // TESTE 3: Executar uma consulta simplificada primeiro
    try {
      const simplifiedQuery = await Contact.findAll({
        where: {
          is_being_attended: true,
          id: {
            [Op.in]: Sequelize.literal(`(
              SELECT DISTINCT c.id 
              FROM contacts c
              INNER JOIN pet_owners po ON c.pet_owner_id = po.id
              INNER JOIN pet_owner_clinics poc ON po.id = poc.pet_owner_id
              WHERE poc.clinic_id = '${clinic_id}'
              AND c.is_being_attended = true
            )`),
          },
        },
        attributes: ['id', 'pet_owner_id', 'is_being_attended'],
        limit: 5,
      });

      console.log(
        '🔍 TESTE 3 - Contatos sendo atendidos encontrados na consulta simplificada:',
        simplifiedQuery.length,
      );
      console.log(
        '🔍 TESTE 3 - IDs:',
        simplifiedQuery.map((c) => c.id),
      );
    } catch (err) {
      console.error('❌ TESTE 3 - Erro na consulta simplificada:', err.message);
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

    console.log('🔍 RESULTADO FINAL (BEING ATTENDED):', contacts.length, 'contatos retornados');

    // DEBUG ADICIONAL: Vamos testar step by step o que está quebrando
    if (contacts.length === 0 && totalItems > 0) {
      console.log('🔍 === INVESTIGAÇÃO DA CONSULTA COMPLEXA (BEING ATTENDED) ===');

      // Teste 1: Apenas o where básico + ChatHistory simples
      try {
        const test1 = await Contact.findAll({
          where: whereConditions,
          include: [
            {
              model: ChatHistory,
              as: 'chatHistory',
              where: chatHistoryWhere,
              required: true,
              attributes: ['id', 'message', 'path'],
            },
          ],
          limit: 2,
        });
        console.log('🔍 TESTE 1 - ChatHistory simples:', test1.length, 'contatos');
      } catch (err) {
        console.log('❌ TESTE 1 - Erro:', err.message);
      }

      // Teste 2: Adicionar o PetOwner
      try {
        const test2 = await Contact.findAll({
          where: whereConditions,
          include: [
            {
              model: ChatHistory,
              as: 'chatHistory',
              where: chatHistoryWhere,
              required: true,
              attributes: ['id', 'message', 'path'],
            },
            {
              model: PetOwner,
              as: 'petOwner',
              attributes: ['id', 'name'],
            },
          ],
          limit: 2,
        });
        console.log('🔍 TESTE 2 - Com PetOwner:', test2.length, 'contatos');
      } catch (err) {
        console.log('❌ TESTE 2 - Erro:', err.message);
      }

      // Teste 3: Verificar se é o order que está quebrando
      try {
        const test3 = await Contact.findAll({
          where: whereConditions,
          include: [
            {
              model: ChatHistory,
              as: 'chatHistory',
              where: chatHistoryWhere,
              required: true,
              attributes: ['id', 'message', 'path', 'timestamp'],
            },
          ],
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
          ],
          limit: 2,
        });
        console.log('🔍 TESTE 3 - Com ORDER BY:', test3.length, 'contatos');
      } catch (err) {
        console.log('❌ TESTE 3 - Erro ORDER BY:', err.message);
      }

      // Teste 4: Verificar se são os includes aninhados do ChatHistory
      try {
        const test4 = await Contact.findAll({
          where: whereConditions,
          include: [
            {
              model: ChatHistory,
              as: 'chatHistory',
              where: chatHistoryWhere,
              required: true,
              attributes: ['id', 'message', 'path', 'template_id'],
              include: [
                {
                  model: Template,
                  as: 'template',
                  attributes: ['id', 'template_name'],
                  required: false,
                },
              ],
            },
          ],
          limit: 2,
        });
        console.log('🔍 TESTE 4 - Com Template include:', test4.length, 'contatos');
      } catch (err) {
        console.log('❌ TESTE 4 - Erro Template:', err.message);
      }
    }

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

    console.log('🔍 Buscando contato para:', { pet_owner_id, contact });
    console.log('🔍 Página:', page, 'Limit:', limit, 'Offset:', offset);

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

    console.log('🔍 Contato encontrado:', contactResult ? contactResult.id : 'nenhum');
    console.log('🔍 Total de mensagens:', totalMessages);

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

    console.log('🔍 Buscando contato para pet_owner_id:', pet_owner_id);
    console.log('🔍 Página:', page, 'Limit:', limit, 'Offset:', offset);

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

    console.log('🔍 Contato encontrado:', contact ? contact.id : 'nenhum');
    console.log('🔍 Total de mensagens:', totalMessages);

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

    console.log('🔍 Buscando TODOS os contatos com limite de 15 mensagens cada');
    console.log('🔍 Página:', page, 'Limit contatos:', limit, 'Offset:', offset);

    const { count: totalItems, rows: contacts } = await Contact.findAndCountAll({
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

    console.log('🔍 RESULTADO FINAL:', contacts.length, 'contatos retornados');
    console.log('🔍 Total de contatos no banco:', totalItems);

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

export default {
  getAllContactsWithMessages,
  getAllContactsBeingAttended,
  searchContacts,
  getReplyMessageById,
  getContactByPetOwnerId,
  getContactByPetOwnerIdOrPhone,
  getAllContactsMessagesWithNoFilters,
};
