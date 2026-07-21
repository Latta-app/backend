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

// Test personas (scripts/test-onboarding-personas.ts): phones 5500000000XXX.
// DUAS fontes de verdade (UNION) pra garantir que nenhum test persona vaza
// pra aba "Geral":
//   1) chat_history.path LIKE 'test-persona|%' — marker gravado pela EF
//      chat-history-logger (supabase/functions/chat-history-logger/index.ts:73)
//      ao processar phones no range.
//   2) contacts.cellphone ~ '^5500000000[0-9]{3}$' — range oficial das test
//      personas documentado em .claude/rules/general-rules.md. Cobre contacts
//      criados direto via script (sem passar pela EF) ou cujo chat_history
//      foi gravado antes do marker existir. Auditoria SQL 2026-04-24 detectou
//      9 test personas vazando por depender só do marker.
// Detalhes: docs/knowledge/test-personas.md
const TEST_CONTACT_IDS_SUBQUERY = `(
  SELECT DISTINCT ch.contact_id FROM chat_history ch
  WHERE ch.path LIKE 'test-persona|%' AND ch.contact_id IS NOT NULL
  UNION
  SELECT c.id FROM contacts c
  WHERE c.cellphone ~ '^5500000000[0-9]{3}$'
)`;

// B2B contacts (clínicas): contacts cujo cellphone bate com algum
// clinics.phone_normalized OU clinics.phone. Source of truth eh a tabela
// clinics, NAO o path do chat_history — antes filtrávamos por
// path LIKE 'merchant-scheduling-agent|%' mas isso incluia o tutor (o
// agent loga inbound do user com esse mesmo prefixo).
const B2B_CONTACT_IDS_SUBQUERY = `(
  SELECT DISTINCT c.id FROM contacts c
  WHERE c.cellphone IN (
    SELECT phone_normalized FROM clinics WHERE phone_normalized IS NOT NULL
    UNION
    SELECT phone FROM clinics WHERE phone IS NOT NULL
  )
)`;

// Staging contacts: phones na whitelist staging_users (ADR-0007 Fatia 7).
// Usado pra filtrar mensageria do admin web por environment:
//   - environment='homolog': mostra APENAS contacts com cellphone em staging_users
//   - environment='prod' (ou undefined): sem filtro (comportamento atual)
// Helper centralizado pra evitar drift entre listing/count/search/detail.
const STAGING_CONTACT_IDS_SUBQUERY = `(
  SELECT DISTINCT c.id FROM contacts c
  WHERE c.cellphone IN (SELECT phone FROM staging_users)
)`;

// Universo QA = whitelist (staging_users) UNION test personas (marcador
// test-persona| no path OU cellphone do range 5500000000XXX). ADR-0007 Fatia 7
// (refinado 2026-06-02): test + whitelist vivem SO no homolog; o prod nao
// mostra nenhum dos dois (aba "Testes" do prod foi removida). Sem a uniao,
// test personas que nao estao na whitelist (ex: usados em smoke) ficariam
// orfaos — invisiveis no prod (excluidos) e no homolog (nao-whitelist).
const QA_CONTACT_IDS_SUBQUERY = `(
  SELECT c.id FROM contacts c WHERE c.cellphone IN (SELECT phone FROM staging_users)
  UNION
  SELECT DISTINCT ch.contact_id FROM chat_history ch
  WHERE ch.path LIKE 'test-persona|%' AND ch.contact_id IS NOT NULL
  UNION
  SELECT c.id FROM contacts c WHERE c.cellphone ~ '^5500000000[0-9]{3}$'
)`;

// Filtro de environment (ADR-0007 Fatia 7 + refino 2026-06-02):
//   - homolog: mostra APENAS o universo QA (whitelist ∪ test personas)
//   - prod:    EXCLUI todo o universo QA (operador ve so cliente real).
// Antes o prod retornava null (sem filtro) — o que vazava whitelist (ex: Lucas)
// pro admin principal. Agora e o espelho exato do homolog. Dinamico via
// staging_users (cache 30s no helper) — sai/entra da whitelist reflete sem
// marcar nada por contato.
const buildStagingEnvironmentCondition = (Op, environment) => {
  if (environment === 'homolog') {
    return { id: { [Op.in]: Sequelize.literal(QA_CONTACT_IDS_SUBQUERY) } };
  }
  return { id: { [Op.notIn]: Sequelize.literal(QA_CONTACT_IDS_SUBQUERY) } };
};

// Environment na BUSCA — mais permissivo que o das abas, de proposito.
// As abas sao listagens passivas: o operador nao pediu por ninguem, entao o
// prod nao deve empurrar contato de QA pra ele. A busca e' o oposto — ele
// digitou um nome/telefone especifico. Excluir a whitelist ali fazia buscar
// "matheus" devolver "Nenhuma conversa encontrada" mesmo com a conversa
// existindo, e a unica saida era o Debug Mode.
//   - homolog: mostra APENAS o universo QA (igual as abas)
//   - prod:    exclui so as personas SINTETICAS (range 5500000000XXX / marker
//              test-persona|). A whitelist staging_users volta a ser
//              encontravel — e' gente real, com conversa real.
const buildSearchEnvironmentCondition = (Op, environment) => {
  if (environment === 'homolog') {
    return { id: { [Op.in]: Sequelize.literal(QA_CONTACT_IDS_SUBQUERY) } };
  }
  return { id: { [Op.notIn]: Sequelize.literal(TEST_CONTACT_IDS_SUBQUERY) } };
};

const RECENT_ORDERS_LIMIT = 10;
const ORDER_LIST_ATTRS = [
  'id',
  'marketplace_order_id',
  'created_at',
  'total',
  'current_status_name',
  'payment_method',
  'delivery_estimate',
];
const ORDER_ITEM_LIST_ATTRS = ['id', 'name', 'brand', 'category', 'sku', 'thumbnail_url'];

// Colunas da row de chat_history que a mensageria renderiza. Eram SEIS copias
// identicas desta lista espalhadas pelos handlers de listing/detail/search —
// coluna nova tinha que ser lembrada nos seis lugares, e esquecer um deles faz
// a tela mentir em silencio (foi assim que delivery_status quase entrou so na
// metade das abas).
//
// E' uma FUNCAO, nao um const array, de proposito: este array e' passado dentro
// de `include:`, e o Sequelize faz push de FKs no `attributes` do include ao
// montar o join. Um array compartilhado entre as 6 queries acumularia colunas
// de uma chamada pra outra. Cada call-site recebe uma copia nova.
const chatHistoryMessageAttrs = () => [
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
  // Status de entrega do WhatsApp (PR #872 do repo principal). So rows de saida
  // carregam valor; `null` numa row de saida = enviado, status ainda nao chegou.
  'delivery_status',
  'delivery_error',
  'delivery_updated_at',
];

// Anexa os N pedidos mais recentes do petOwner ao contact retornado pelos
// handlers de detail. Substitui o include Sequelize com `separate: true` que
// vinha truncando silenciosamente abaixo do limit em produção (LEFT OUTER
// JOIN aninhado em PetOwner+OrderItem misturava o LIMIT do separate com
// agregações do parent). Pedidos antigos chegam paginados via
// getOrdersByContactId quando o operador scrolla a lista no chat.
const attachRecentOrders = async (contact) => {
  const petOwner = contact?.petOwner;
  const petOwnerId = petOwner?.id;
  if (!petOwnerId) return;
  const orders = await Order.findAll({
    where: { pet_owner_id: petOwnerId },
    attributes: ORDER_LIST_ATTRS,
    include: [
      {
        model: OrderItem,
        as: 'items',
        attributes: ORDER_ITEM_LIST_ATTRS,
        required: false,
      },
    ],
    order: [['created_at', 'DESC']],
    limit: RECENT_ORDERS_LIMIT,
  });
  petOwner.setDataValue('orders', orders);
};

const buildTestChatFilter = (testFilter = 'exclude') => {
  if (testFilter === 'only') return { op: 'in' };
  if (testFilter === 'none') return null;
  return { op: 'notIn' };
};

// Mesmo pattern do testFilter pra aba B2B:
//   'only'    -> mostra SO clinicas
//   'exclude' -> exclui clinicas das outras abas (Geral/Luma)
//   'none'    -> nao filtra
const buildB2bChatFilter = (b2bFilter = 'exclude') => {
  if (b2bFilter === 'only') return { op: 'in' };
  if (b2bFilter === 'none') return null;
  return { op: 'notIn' };
};

// Escopo de uma aba da mensageria: os predicados que definem QUAIS contacts
// pertencem a ela (tem conversa, estado de atendimento, universo QA, B2B).
// Compartilhado entre a listagem e o badge de contagem.
//
// Antes cada count tinha SQL raw proprio, que foi driftando da listagem: o
// badge do B2B contava clinica SEM nenhuma linha em chat_history e sem excluir
// o universo QA, entao mostrava "1" numa aba que a listagem devolvia vazia
// (incidente 2026-07-14, contact "Iris Clinica Teste"). Os badges da Luma e de
// Testes tinham o mesmo defeito latente. Contagem e listagem agora derivam do
// mesmo builder — divergir de novo exige mudar este bloco, que serve os dois.
//
// NAO cobre os filtros do operador (tags/responsibility/unread): esses sao
// refinamentos por cima do escopo e nao entram no badge.
const buildContactScopeWhere = ({
  role,
  testFilter = 'exclude',
  b2bFilter = 'exclude',
  stagingFilter = 'none',
  environment = 'prod',
  beingAttended = false,
}) => {
  const { Op } = Sequelize;
  const shouldFilterLatta = role !== 'admin' && role !== 'superAdmin';
  const testChatFilter = buildTestChatFilter(testFilter);
  const b2bChatFilter = buildB2bChatFilter(b2bFilter);

  // Aba "Testers" (stagingFilter='only'): mostra os humanos reais da whitelist
  // staging_users — hoje os socios testando em prod com o proprio numero.
  // Eles sao invisiveis nas outras abas porque o universo QA e' excluido do
  // prod, e ate agora so o Debug Mode os alcancava. Aqui a aba e' um recorte
  // deliberado desse universo, entao NAO aplica o filtro de environment (que
  // e' justamente quem os esconde) — ver mais abaixo.
  const stagingOnly = stagingFilter === 'only';

  // Base: contatos que TEM pelo menos uma chat_history. Sem corte por
  // clinic_id — visao unificada (refactor 2026-05-08): so dois socios usam o
  // painel, ambos veem tudo. Se voltar multi-clinic, reintroduzir join aqui.
  const baseSubquery = `(
    SELECT DISTINCT c.id
    FROM contacts c
    WHERE ${beingAttended ? 'c.is_being_attended = true AND' : ''} EXISTS (
      SELECT 1 FROM chat_history ch
      WHERE ch.contact_id = c.id
      ${shouldFilterLatta ? `AND ch.path != 'latta'` : ''}
    )
  )`;

  const scope = { id: { [Op.in]: Sequelize.literal(baseSubquery) } };

  if (beingAttended) {
    scope.is_being_attended = true;
  } else if (testFilter !== 'only' && !stagingOnly) {
    // Geral/B2B excluem conversas em atendimento humano (Luma assumiu) — essas
    // so aparecem na aba "Luma". Sem isso, conversa atendida apareceria em duas
    // abas. Nao vale pras abas Testes/Testers, que sao recortes de populacao
    // (quem e' a pessoa), nao de estado — mostram o contato atendido ou nao.
    scope.is_being_attended = { [Op.not]: true };
  }

  // Filtros aplicados como condicao AND separada (Op.in/notIn com literal de
  // subquery) porque esse e o pattern que funciona confiavelmente com
  // findAndCountAll + distinct.
  const conditions = [];

  if (testChatFilter) {
    conditions.push({
      id: {
        [testChatFilter.op === 'in' ? Op.in : Op.notIn]:
          Sequelize.literal(TEST_CONTACT_IDS_SUBQUERY),
      },
    });
  }

  if (b2bChatFilter) {
    conditions.push({
      id: {
        [b2bChatFilter.op === 'in' ? Op.in : Op.notIn]:
          Sequelize.literal(B2B_CONTACT_IDS_SUBQUERY),
      },
    });
  }

  if (stagingOnly) {
    // A aba Testers E' a whitelist. Aplicar buildStagingEnvironmentCondition
    // aqui a esvaziaria em prod (o filtro exclui exatamente esse universo) e
    // seria redundante em homolog (que ja mostra so o universo QA). Combinado
    // com testFilter='exclude' do caller, sobram os humanos reais: whitelist
    // MENOS as personas sinteticas (range 5500000000XXX / path test-persona|).
    conditions.push({
      id: { [Op.in]: Sequelize.literal(STAGING_CONTACT_IDS_SUBQUERY) },
    });
  } else {
    const stagingEnvCondition = buildStagingEnvironmentCondition(Op, environment);
    if (stagingEnvCondition) {
      conditions.push(stagingEnvCondition);
    }
  }

  return { scope, conditions };
};

// Conta os contacts de uma aba usando exatamente o escopo que a listagem usa.
// Alimenta os badges (Luma, B2B, Testes).
const countContactsInScope = async (params) => {
  const { Op } = Sequelize;
  const { scope, conditions } = buildContactScopeWhere(params);
  const where = conditions.length > 0 ? { ...scope, [Op.and]: conditions } : scope;

  const count = await Contact.count({ where, distinct: true, col: 'id' });
  return { count };
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
    const offset = (page - 1) * limit;
    const { Op } = Sequelize;

    const shouldFilterLatta = role !== 'admin' && role !== 'superAdmin';
    const chatHistoryWhere = shouldFilterLatta ? { path: { [Op.ne]: 'latta' } } : {};

    // Escopo da aba (tem conversa + estado de atendimento + test/B2B/QA).
    // Mesmo builder que alimenta o badge — ver buildContactScopeWhere.
    const { scope, conditions: additionalConditions } = buildContactScopeWhere({
      role,
      testFilter,
      b2bFilter,
      stagingFilter,
      environment,
    });

    let whereConditions = { ...scope };

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
            WHERE EXISTS (
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
            WHERE EXISTS (
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
          attributes: chatHistoryMessageAttrs(),
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
            // ⚠️ Order include removido do listing.
            // Único consumidor de petOwner.orders é o painel de detalhes
            // (InfosSection.jsx) — que já chama getContactByPetOwnerId.
            // Manter Orders + OrderItem aqui custava 14+ colunas x N pedidos
            // x M itens por contato (até 15 contatos no listing) — peso real
            // na latência do "Carregando conversas...". Mantido nos handlers
            // de detalhe (getContactByPetOwnerId / getContactByContactId).
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

// Aba Luma. b2bFilter='none' de proposito: a Luma e' um recorte de ESTADO
// (quem esta em atendimento humano), nao de populacao. Excluir clinicas aqui
// abria um buraco — a aba B2B ja exclui quem esta em atendimento, entao uma
// clinica sendo atendida nao aparecia em lugar nenhum do painel.
const getAllContactsBeingAttended = async ({
  role,
  page = 1,
  limit = 15,
  user_id,
  filters = {},
  testFilter = 'exclude',
  b2bFilter = 'none',
  environment = 'prod',
}) => {
  try {
    const offset = (page - 1) * limit;
    const { Op } = Sequelize;

    const shouldFilterLatta = role !== 'admin' && role !== 'superAdmin';
    const chatHistoryWhere = shouldFilterLatta ? { path: { [Op.ne]: 'latta' } } : {};

    // Escopo da aba Luma: contatos em atendimento humano com chat_history.
    // Mesmo builder que alimenta o badge — ver buildContactScopeWhere.
    const { scope, conditions: additionalConditions } = buildContactScopeWhere({
      role,
      testFilter,
      b2bFilter,
      environment,
      beingAttended: true,
    });

    let whereConditions = { ...scope };

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
            AND c.is_being_attended = true
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
            WHERE c.is_being_attended = true
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
            WHERE c.is_being_attended = true
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
          attributes: chatHistoryMessageAttrs(),
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
            // Order include removido — listing não usa orders no preview.
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
  name,
  phone,
  page = 1,
  limit = 15,
  role,
  user_id,
  filters = {},
  environment = 'prod',
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

    // Sem corte por clinic_id — visão unificada (refactor 2026-05-08).
    let whereConditions = finalConditions.length > 0 ? { [Op.or]: finalConditions } : {};

    // Aplica os filtros adicionais (mesma lógica do getAllContacts)
    const additionalConditions = [];

    // FILTRO DE ENVIRONMENT — na busca, a whitelist E' encontravel em prod.
    // Ver buildSearchEnvironmentCondition.
    const stagingEnvCondition = buildSearchEnvironmentCondition(Op, environment);
    if (stagingEnvCondition) {
      additionalConditions.push(stagingEnvCondition);
    }

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
            WHERE EXISTS (
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
            WHERE EXISTS (
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
        // NAO ordenar por coluna do include (era `[{model: ChatHistory}, 'timestamp']`):
        // como ha `limit` no parent, o Sequelize move os contatos pra uma subconsulta e o
        // ORDER BY externo passa a referenciar "chatHistory", que nao existe naquele
        // escopo -> o Postgres derruba a query inteira com
        // `missing FROM-clause entry for table "chatHistory"`. A busca por nome/telefone
        // NUNCA retornou nada por causa disso: o controller devolvia erro e o frontend,
        // que trata falha como lista vazia, mostrava "Nenhuma conversa encontrada".
        // getAllContactsWithMessages ja tinha caido nessa armadilha e ordena so por
        // subquery correlacionada — aqui seguimos o mesmo padrao. A ordem das mensagens
        // dentro de cada contato e resolvida no cliente (sortChatHistory).
      ],
      include: [
        {
          model: ChatHistory,
          as: 'chatHistory',
          required: false,
          // Limite por contato via subquery correlacionada, e nao pelo `limit` do
          // Sequelize: `limit` dentro de include hasMany so funciona com
          // `separate: true` (N+1 queries) e conflita com o limit do parent. Mesmo
          // padrao de getAllContactsWithMessages.
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
          attributes: chatHistoryMessageAttrs(),
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
            // Order include removido do search listing.
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
          attributes: chatHistoryMessageAttrs(),
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
              attributes: ['id', 'name', 'date_of_birthday', 'photo', 'photo_thumb', 'pet_subscription_id', 'happy_photo', 'hungry_photo', 'angry_photo'],
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

    await attachRecentOrders(contactResult);

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

const getContactByPetOwnerId = async ({
  pet_owner_id,
  role,
  page = 1,
  limit = 20,
  before = null,
  after = null,
}) => {
  try {
    const { Op } = Sequelize;

    const shouldFilterLatta = role !== 'admin' && role !== 'superAdmin';
    const chatHistoryWhere = shouldFilterLatta ? { path: { [Op.ne]: 'latta' } } : {};

    // Cursor modes:
    //   before=ISO  → msgs ANTERIORES (scroll-up no histórico)
    //   after=ISO   → msgs POSTERIORES (scroll-down após jumpToDate)
    // Page mode (legacy): mantém compat com chamadas antigas que ainda usam ?page=.
    if (before && after) {
      throw new Error("Provide 'before' or 'after', not both");
    }
    const useBeforeCursor = !!before;
    const useAfterCursor = !!after;
    const useCursor = useBeforeCursor || useAfterCursor;
    if (useBeforeCursor && Number.isNaN(new Date(before).getTime())) {
      throw new Error(`Invalid 'before' timestamp: ${before}`);
    }
    if (useAfterCursor && Number.isNaN(new Date(after).getTime())) {
      throw new Error(`Invalid 'after' timestamp: ${after}`);
    }
    const beforeIso = useBeforeCursor ? new Date(before).toISOString() : null;
    const afterIso = useAfterCursor ? new Date(after).toISOString() : null;
    const offset = (page - 1) * limit;

    // SQL clauses pro subquery interno do include de chatHistory.
    // Pra 'after' usamos ASC (próximas msgs em ordem cronológica) e
    // depois invertemos pra DESC ao retornar — mantém shape consistente
    // com os outros modos.
    let cursorClause = '';
    let orderClause = 'ORDER BY ch.timestamp DESC';
    let offsetClause = '';
    if (useBeforeCursor) {
      cursorClause = `AND ch.timestamp < '${beforeIso}'`;
    } else if (useAfterCursor) {
      cursorClause = `AND ch.timestamp > '${afterIso}'`;
      orderClause = 'ORDER BY ch.timestamp ASC';
    } else {
      offsetClause = `OFFSET ${offset}`;
    }

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
                ${cursorClause}
                ${orderClause}
                LIMIT ${limit} ${offsetClause}
              )`),
            },
          },
          attributes: chatHistoryMessageAttrs(),
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
              attributes: ['id', 'name', 'date_of_birthday', 'photo', 'photo_thumb', 'pet_subscription_id', 'happy_photo', 'hungry_photo', 'angry_photo'],
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

    await attachRecentOrders(contact);

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

    // chatHistory vem ordenado DESC pelo include order. Cobre os 3 modos:
    // - before/offset: já DESC do subquery
    // - after: subquery ASC pega "primeiras N depois do cursor", mas o
    //   include order DESC reordena pra UI consumir igual aos outros modos
    const returnedMessages = contact?.chatHistory?.length || 0;
    const oldestTimestamp = returnedMessages
      ? contact.chatHistory[contact.chatHistory.length - 1]?.timestamp || null
      : null;
    const newestTimestamp = returnedMessages
      ? contact.chatHistory[0]?.timestamp || null
      : null;

    const pagination = useCursor
      ? {
          mode: 'cursor',
          direction: useAfterCursor ? 'after' : 'before',
          limit,
          before: beforeIso,
          after: afterIso,
          returned: returnedMessages,
          oldestTimestamp,
          newestTimestamp,
          hasMore: returnedMessages >= limit,
          totalMessages,
        }
      : {
          mode: 'offset',
          currentPage: page,
          limit,
          totalMessages,
          hasMore: totalMessages > page * limit,
          totalPages: Math.ceil(totalMessages / limit),
        };

    return { contact, pagination };
  } catch (error) {
    console.error('❌ ERRO NA FUNÇÃO getContactByPetOwnerId:', error.message);
    console.error('❌ STACK:', error.stack);
    throw new Error(`Repository error: ${error.message}`);
  }
};

const getContactByContactId = async ({
  contact_id,
  role,
  page = 1,
  limit = 20,
  before = null,
  after = null,
}) => {
  try {
    const { Op } = Sequelize;

    const shouldFilterLatta = role !== 'admin' && role !== 'superAdmin';
    const chatHistoryWhere = shouldFilterLatta ? { path: { [Op.ne]: 'latta' } } : {};

    if (before && after) {
      throw new Error("Provide 'before' or 'after', not both");
    }
    const useBeforeCursor = !!before;
    const useAfterCursor = !!after;
    const useCursor = useBeforeCursor || useAfterCursor;
    if (useBeforeCursor && Number.isNaN(new Date(before).getTime())) {
      throw new Error(`Invalid 'before' timestamp: ${before}`);
    }
    if (useAfterCursor && Number.isNaN(new Date(after).getTime())) {
      throw new Error(`Invalid 'after' timestamp: ${after}`);
    }
    const beforeIso = useBeforeCursor ? new Date(before).toISOString() : null;
    const afterIso = useAfterCursor ? new Date(after).toISOString() : null;
    const offset = (page - 1) * limit;

    let cursorClause = '';
    let orderClause = 'ORDER BY ch.timestamp DESC';
    let offsetClause = '';
    if (useBeforeCursor) {
      cursorClause = `AND ch.timestamp < '${beforeIso}'`;
    } else if (useAfterCursor) {
      cursorClause = `AND ch.timestamp > '${afterIso}'`;
      orderClause = 'ORDER BY ch.timestamp ASC';
    } else {
      offsetClause = `OFFSET ${offset}`;
    }

    const contact = await Contact.findOne({
      where: { id: contact_id },
      order: [
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
                ${cursorClause}
                ${orderClause}
                LIMIT ${limit} ${offsetClause}
              )`),
            },
          },
          attributes: chatHistoryMessageAttrs(),
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
              attributes: ['id', 'name', 'date_of_birthday', 'photo', 'photo_thumb', 'pet_subscription_id', 'happy_photo', 'hungry_photo', 'angry_photo'],
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
              through: { attributes: ['assigned_at', 'user_id'] },
              order: [['name', 'ASC']],
              where: { is_active: true },
              required: false,
            },
          ],
          required: false,
        },
      ],
    });

    await attachRecentOrders(contact);

    let totalMessages = 0;
    if (contact) {
      totalMessages = await ChatHistory.count({
        where: {
          contact_id: contact.id,
          ...chatHistoryWhere,
        },
      });
    }

    const returnedMessages = contact?.chatHistory?.length || 0;
    const oldestTimestamp = returnedMessages
      ? contact.chatHistory[contact.chatHistory.length - 1]?.timestamp || null
      : null;
    const newestTimestamp = returnedMessages
      ? contact.chatHistory[0]?.timestamp || null
      : null;

    const pagination = useCursor
      ? {
          mode: 'cursor',
          direction: useAfterCursor ? 'after' : 'before',
          limit,
          before: beforeIso,
          after: afterIso,
          returned: returnedMessages,
          oldestTimestamp,
          newestTimestamp,
          hasMore: returnedMessages >= limit,
          totalMessages,
        }
      : {
          mode: 'offset',
          currentPage: page,
          limit,
          totalMessages,
          hasMore: totalMessages > page * limit,
          totalPages: Math.ceil(totalMessages / limit),
        };

    return { contact, pagination };
  } catch (error) {
    console.error('❌ ERRO NA FUNÇÃO getContactByContactId:', error.message);
    console.error('❌ STACK:', error.stack);
    throw new Error(`Repository error: ${error.message}`);
  }
};

// Paginação dos pedidos do contato — alimentada pelo scroll infinito do
// OrdersHistory.jsx. A primeira página já vem embutida em getContactByContactId
// (limit:10 no include); este endpoint serve as páginas seguintes (mais antigos).
const getOrdersByContactId = async ({ contact_id, page = 1, limit = 10 }) => {
  try {
    const contact = await Contact.findOne({
      where: { id: contact_id },
      attributes: ['id', 'pet_owner_id'],
    });

    if (!contact?.pet_owner_id) {
      return {
        orders: [],
        pagination: { currentPage: page, limit, totalOrders: 0, hasMore: false, totalPages: 0 },
      };
    }

    const offset = (page - 1) * limit;

    const { count, rows } = await Order.findAndCountAll({
      where: { pet_owner_id: contact.pet_owner_id },
      attributes: [
        'id',
        'marketplace_order_id',
        'created_at',
        'total',
        'current_status_name',
        'payment_method',
        'delivery_estimate',
      ],
      include: [
        {
          model: OrderItem,
          as: 'items',
          attributes: ['id', 'name', 'brand', 'category', 'sku', 'thumbnail_url'],
          required: false,
        },
      ],
      order: [['created_at', 'DESC']],
      limit,
      offset,
      distinct: true,
    });

    return {
      orders: rows,
      pagination: {
        currentPage: page,
        limit,
        totalOrders: count,
        hasMore: count > page * limit,
        totalPages: Math.ceil(count / limit),
      },
    };
  } catch (error) {
    console.error('❌ ERRO NA FUNÇÃO getOrdersByContactId:', error.message);
    console.error('❌ STACK:', error.stack);
    throw new Error(`Repository error: ${error.message}`);
  }
};

// Retrato de valor do cliente (visão Métricas do painel direito). v2: 3 recortes
// (Latta / Pré-Latta / Consolidado) em `scopes`, cada um com o mesmo shape rico
// — PRD docs/issues/mensageria-metricas-3-visoes/ (issues 01/02/03). Mantém as
// chaves de topo legadas (latta/petz_legacy/top_items) como espelho da v1.
// Resolve contact_id → pet_owner_id (mesmo padrão de getOrdersByContactId) e
// delega a agregação pra RPC get_client_metrics (SECURITY DEFINER, predicados
// canônicos do cockpit: _is_latta_revenue, status pago, test personas).
// Raw query porque o model Sequelize Order não conhece orders.source.
const CLIENT_METRICS_TOP_ITEMS_LIMIT = 3;

// Recorte zerado — mesma shape que o helper _client_scope_snapshot da RPC.
const emptyClientMetricsScope = () => ({
  orders: 0,
  total_spent: 0,
  avg_ticket: null,
  in_progress_orders: 0,
  in_progress_value: 0,
  cancelled_orders: 0,
  first_order_at: null,
  last_order_at: null,
  cadence_days: null,
  days_since_last: null,
  top_items: [],
  last_order: null,
});

const getClientMetricsByContactId = async ({ contact_id }) => {
  try {
    const contact = await Contact.findOne({
      where: { id: contact_id },
      attributes: ['id', 'pet_owner_id'],
    });

    if (!contact?.pet_owner_id) {
      // Contato sem pet_owner → resposta vazia válida (mesma shape da RPC v2).
      return {
        pet_owner_id: null,
        found: false,
        scopes: {
          latta: emptyClientMetricsScope(),
          pre_latta: emptyClientMetricsScope(),
          consolidado: { ...emptyClientMetricsScope(), share_latta_pct: 0 },
        },
        latta: { total_spent: 0, paid_orders: 0, avg_ticket: null, last_order_at: null },
        petz_legacy: { orders_count: 0, total_spent: 0, oldest_at: null, newest_at: null },
        top_items: [],
        gmv_filter: 'latta_only',
        generated_at: new Date().toISOString(),
      };
    }

    const sequelize = ChatHistory.sequelize;
    const rows = await sequelize.query(
      `SELECT get_client_metrics(CAST(:pet_owner_id AS uuid), :top_items_limit) AS metrics`,
      {
        replacements: {
          pet_owner_id: contact.pet_owner_id,
          top_items_limit: CLIENT_METRICS_TOP_ITEMS_LIMIT,
        },
        type: Sequelize.QueryTypes.SELECT,
      },
    );
    return rows[0]?.metrics ?? null;
  } catch (error) {
    console.error('❌ ERRO getClientMetricsByContactId:', error.message);
    throw new Error(`Repository error: ${error.message}`);
  }
};


// Badge da aba Luma: conta o MESMO conjunto que getAllContactsBeingAttended
// lista (em atendimento humano, com chat_history, fora do universo QA em prod,
// clinicas incluidas).
const getInAttendanceContactsCount = async ({
  role,
  testFilter = 'exclude',
  b2bFilter = 'none',
  environment = 'prod',
} = {}) => {
  try {
    return await countContactsInScope({
      role,
      testFilter,
      b2bFilter,
      environment,
      beingAttended: true,
    });
  } catch (error) {
    console.error('❌ ERRO getInAttendanceContactsCount:', error.message);
    throw new Error(`Repository error: ${error.message}`);
  }
};

// Badge da aba Testes: conta o MESMO conjunto que getAllTestContacts lista.
const getTestContactsCount = async ({ role, environment = 'prod' }) => {
  try {
    return await countContactsInScope({
      role,
      testFilter: 'only',
      b2bFilter: 'none',
      environment,
    });
  } catch (error) {
    console.error('❌ ERRO getTestContactsCount:', error.message);
    throw new Error(`Repository error: ${error.message}`);
  }
};

// Badge da aba B2B: conta o MESMO conjunto que getAllB2bContacts lista.
const getB2bContactsCount = async ({ role, environment = 'prod' }) => {
  try {
    return await countContactsInScope({
      role,
      testFilter: 'none',
      b2bFilter: 'only',
      environment,
    });
  } catch (error) {
    console.error('❌ ERRO getB2bContactsCount:', error.message);
    throw new Error(`Repository error: ${error.message}`);
  }
};

// Badge da aba Testers: conta o MESMO conjunto que getAllTesterContacts lista.
const getTesterContactsCount = async ({ role, environment = 'prod' }) => {
  try {
    return await countContactsInScope({
      role,
      testFilter: 'exclude',
      b2bFilter: 'none',
      stagingFilter: 'only',
      environment,
    });
  } catch (error) {
    console.error('❌ ERRO getTesterContactsCount:', error.message);
    throw new Error(`Repository error: ${error.message}`);
  }
};

// Resumo de dias com mensagens pra um contato — alimenta o date picker da
// mensageria. Agrupa por dia em America/Sao_Paulo (timezone do operador) e
// aplica o mesmo filtro de role usado em getContactByPetOwnerId/getContactByContactId.
// Recebe pet_owner_id OU contact_id (um dos dois). Pet_owner_id é resolvido
// pra contact_id internamente — consistente com o resto do módulo.
const getMessagesDaysSummary = async ({ pet_owner_id = null, contact_id = null, role }) => {
  try {
    if (!pet_owner_id && !contact_id) {
      throw new Error('pet_owner_id or contact_id is required');
    }

    let resolvedContactId = contact_id;
    if (!resolvedContactId) {
      const contact = await Contact.findOne({
        where: { pet_owner_id },
        attributes: ['id'],
      });
      if (!contact) {
        return { days: [], totalDays: 0, totalMessages: 0 };
      }
      resolvedContactId = contact.id;
    }

    const shouldFilterLatta = role !== 'admin' && role !== 'superAdmin';
    const lattaFilter = shouldFilterLatta ? `AND path != 'latta'` : '';

    const sequelize = ChatHistory.sequelize;
    const rows = await sequelize.query(
      `
      SELECT
        TO_CHAR(timestamp AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM-DD') AS day,
        COUNT(*)::int AS msg_count,
        MIN(timestamp) AS day_start,
        MAX(timestamp) AS day_end
      FROM chat_history
      WHERE contact_id = :contact_id
        ${lattaFilter}
      GROUP BY day
      ORDER BY day DESC
      `,
      {
        replacements: { contact_id: resolvedContactId },
        type: Sequelize.QueryTypes.SELECT,
      },
    );

    const totalMessages = rows.reduce((sum, r) => sum + Number(r.msg_count || 0), 0);

    return {
      days: rows.map((r) => ({
        day: r.day,
        count: Number(r.msg_count),
        dayStart: r.day_start,
        dayEnd: r.day_end,
      })),
      totalDays: rows.length,
      totalMessages,
    };
  } catch (error) {
    console.error('❌ ERRO getMessagesDaysSummary:', error.message);
    throw new Error(`Repository error: ${error.message}`);
  }
};

export default {
  getAllContactsWithMessages,
  getAllContactsBeingAttended,
  searchContacts,
  getReplyMessageById,
  getContactByPetOwnerId,
  getContactByContactId,
  getContactByPetOwnerIdOrPhone,
  getOrdersByContactId,
  getClientMetricsByContactId,
  getTestContactsCount,
  getB2bContactsCount,
  getTesterContactsCount,
  getInAttendanceContactsCount,
  getMessagesDaysSummary,
};
