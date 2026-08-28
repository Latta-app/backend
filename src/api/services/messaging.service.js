// MessagingService — envio outbound (texto livre + template) pelo painel.
//
// Substitui os webhooks N8n /4d712c65... (sendMessage) e /template
// (sendTemplate). Centraliza:
//   1. Envio via Meta Cloud API (graph.facebook.com)
//   2. Log em chat_history (via chat-history-logger EF)
//   3. Set contacts.is_being_attended=true (Luma assumiu)
//   4. Resolução de variáveis automáticas + manual_vars em templates
//
// IMPORTANTE: graph.facebook.com tem ECONNRESET intermitente do Docker EC2.
// Workaround: chama via whatsapp-proxy EF que age como proxy estável.

import { QueryTypes } from 'sequelize';
import { Contact, PetOwner, Template, TemplateVariable, TemplateVariableType } from '../models/index.js';
import ContactRepository from '../repositories/contact.repository.js';
import { callMeta, logToHistory } from './whatsapp-outbound.service.js';
import { sequelize } from '../../config/database.js';



// Canonical Luma sender label gravado em chat_history.name e refletido no
// painel + bolha do tutor. Ver `.claude/rules/n8n-rules.md` (rebrand 2026-05).
const LUMA_NAME = 'Luma';

// Variable-type IDs (templates.template_variable_types). Usados pra resolver
// auto-fill quando o operador NÃO passa manual_vars[N]. IDs hardcoded são
// mais seguros que lookup por type-string (UI/N8n já dependem deles).
const VAR_TYPE_FIRST_NAME = '2c08ff5a-bae6-4ec9-a15d-c6246ad5ee14';
const VAR_TYPE_FULL_NAME = '25df752a-1412-4eaf-9421-7d1b5b92b392';
const VAR_TYPE_PET_NAME = '1edfdb51-7c5b-4822-928f-5a22b57b06c1';
const VAR_TYPE_COMPANY = 'f7929314-8274-43b7-856b-100b9e0af83f';

// A ida à Meta e o log no chat_history saíram daqui pro
// `whatsapp-outbound.service`, sem mudar comportamento: mesmo proxy, mesmo
// timeout, mesmo fire-and-forget do log.
//
// 🚨 O motivo é a rede de recuperação de entrega. Ela depende do rastro nascer
// em TODO sink de outbound, e já ficou 8 dias dormente porque nasceu em um só.
// Um sink novo escondido numa cópia é um sink que nenhuma rede cobre — e o
// Destino da campanha precisava desta mesma ida.
//
// 🚨 O que NÃO foi junto é o `setAttendance` logo abaixo, e essa separação é o
// ponto: aqui ele é verdade (a Luma assumiu a conversa), e numa campanha seria
// desastre. Ver o cabeçalho do módulo extraído.

/**
 * Resolve uma variável automática (não-manual) buscando no DB.
 * Fallback genérico se não achar — Meta API rejeita variáveis vazias.
 */
function resolveAutoVar(typeId, { petOwner, pet }) {
  switch (typeId) {
    case VAR_TYPE_FIRST_NAME:
      return (petOwner?.name || '').split(' ')[0] || 'tutor';
    case VAR_TYPE_FULL_NAME:
      return petOwner?.name || 'tutor';
    case VAR_TYPE_PET_NAME:
      return pet?.name || 'seu pet';
    case VAR_TYPE_COMPANY:
      return LUMA_NAME;
    default:
      return ' ';
  }
}

/**
 * Build a Meta API template payload com variáveis resolvidas.
 * manualVars sobrepõe auto-fill quando posição bate.
 */
async function buildTemplatePayload({ phone, template, manualVars, contact }) {
  const variables = template.variables || [];
  // Lookup de pet_owner + primeiro pet pra resolver auto-vars
  let petOwner = null;
  let pet = null;
  if (contact?.pet_owner_id) {
    // attributes: ['id','name'] — sem isso o Sequelize tenta SELECT *
    // (incluindo pet_photo_commented que existe no model mas nao no DB →
    // erro 42703 quebra o envio de template). Pra resolver auto-vars
    // só precisamos do nome do tutor.
    petOwner = await PetOwner.findByPk(contact.pet_owner_id, {
      attributes: ['id', 'name'],
    });
    if (petOwner) {
      // Pets vinculados via tabela M:M pet_owner_pets (não FK direto em pets).
      // Pega o pet principal ativo (is_main_owner=true tem prioridade, fallback
      // pro mais antigo). Raw query pra escapar do model Sequelize cheio.
      const rows = await sequelize.query(
        `SELECT p.id, p.name FROM pets p
         INNER JOIN pet_owner_pets pop ON pop.pet_id = p.id
         WHERE pop.pet_owner_id = :owner_id AND pop.is_active = true
         ORDER BY pop.is_main_owner DESC, pop.added_at ASC
         LIMIT 1`,
        {
          replacements: { owner_id: petOwner.id },
          type: QueryTypes.SELECT,
        },
      );
      pet = rows[0] || null;
    }
  }

  // Sort variables by position (já vem ordenado, mas garantir)
  const sortedVars = [...variables].sort(
    (a, b) => (a.variable_position || 0) - (b.variable_position || 0),
  );

  const parameters = sortedVars.map((v) => {
    const pos = v.variable_position;
    const manual = manualVars?.[pos] || manualVars?.[String(pos)];
    const text = manual && String(manual).trim() !== ''
      ? String(manual)
      : resolveAutoVar(v.template_varible_type_id, { petOwner, pet });
    return { type: 'text', text };
  });

  return {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: phone,
    type: 'template',
    template: {
      name: template.template_name,
      language: { code: template.template_language || 'pt_BR' },
      components: parameters.length > 0 ? [{ type: 'body', parameters }] : [],
    },
  };
}

/**
 * Substitui {{1}}, {{2}} etc. no template_preview pelos valores resolvidos.
 * Usado pra montar mensagem legível pro chat_history (mensageria) — sem isso
 * o operador veria "*Luma*\n\nOi, {{1}}!" em vez do texto final.
 */
function renderTemplatePreview(template, parameters) {
  let text = template.template_preview || `[Template ${template.template_name}]`;
  parameters.forEach((p, idx) => {
    const placeholder = `{{${idx + 1}}}`;
    text = text.split(placeholder).join(p.text || '');
  });
  return text;
}

const sendText = async ({ contact_id, message, user_id }) => {
  if (!contact_id) throw new Error('contact_id obrigatorio');
  if (!message) throw new Error('message obrigatoria');

  const contact = await Contact.findByPk(contact_id);
  if (!contact) throw new Error('Contact nao encontrado');

  const phone = contact.cellphone;
  // Header *Luma*\n é a assinatura visível pro tutor (substitui o
  // *Petland Belvedere* do workflow N8n antigo).
  const fullText = `*${LUMA_NAME}*\n${message}`;

  const metaResp = await callMeta({
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: phone,
    type: 'text',
    text: { body: fullText, preview_url: false },
  });

  const messageId = metaResp?.messages?.[0]?.id;

  // Log via chat-history-logger EF (single source of truth)
  await logToHistory({
    name: LUMA_NAME,
    cell_phone: phone,
    journey: 'enviada',
    message,
    sent_by: 'petshop',
    message_type: 'text',
    message_id: messageId,
    path: 'petshop',
    user_id: user_id || null,
    contact_id,
    pet_owner_id: contact.pet_owner_id || undefined,
    clinic_id: contact.clinic_id || undefined,
  });

  // Luma assumiu — set is_being_attended=true
  await ContactRepository.setAttendance({ contact_id, is_being_attended: true });

  return { success: true, message_id: messageId };
};

const sendTemplate = async ({ contact_id, template_id, manual_vars, user_id }) => {
  if (!contact_id) throw new Error('contact_id obrigatorio');
  if (!template_id) throw new Error('template_id obrigatorio');

  const contact = await Contact.findByPk(contact_id);
  if (!contact) throw new Error('Contact nao encontrado');

  const template = await Template.findOne({
    where: { id: template_id, template_status: 'APPROVED' },
    include: [
      {
        model: TemplateVariable,
        as: 'variables',
        include: [{ model: TemplateVariableType, as: 'templateVariableType' }],
      },
    ],
    order: [[{ model: TemplateVariable, as: 'variables' }, 'variable_position', 'ASC']],
  });
  if (!template) throw new Error('Template nao encontrado ou nao APPROVED');

  const phone = contact.cellphone;
  const payload = await buildTemplatePayload({ phone, template, manualVars: manual_vars, contact });

  const metaResp = await callMeta(payload);
  const messageId = metaResp?.messages?.[0]?.id;

  // Mensagem legível pra mensageria — substitui {{N}} pelos valores reais
  const bodyComponent = payload.template.components.find((c) => c.type === 'body');
  const renderedMsg = renderTemplatePreview(template, bodyComponent?.parameters || []);

  await logToHistory({
    name: LUMA_NAME,
    cell_phone: phone,
    journey: 'enviada',
    message: renderedMsg,
    sent_by: 'petshop',
    message_type: 'template',
    template_id,
    message_id: messageId,
    path: 'petshop',
    user_id: user_id || null,
    contact_id,
    pet_owner_id: contact.pet_owner_id || undefined,
    clinic_id: contact.clinic_id || undefined,
  });

  await ContactRepository.setAttendance({ contact_id, is_being_attended: true });

  return {
    success: true,
    message_id: messageId,
    template_name: template.template_name,
    // Mensagem com {{N}} ja substituidos — frontend usa pra optimistic UI
    // (sem isso, painel mostraria template_preview cru ate o socket chegar).
    rendered_message: renderedMsg,
  };
};

// Migrado do webhook N8n /ai_accepted na Fase 4. Operador aprova (👍) +
// edita (opcional) a sugestão IA do painel; este endpoint manda a mensagem
// final pro tutor e registra no chat_history com flags ai_accepted=true e
// is_modified (true se operador editou o texto antes de enviar).
const sendAISuggestion = async ({ contact_id, message, is_modificated, user_id }) => {
  if (!contact_id) throw new Error('contact_id obrigatorio');
  if (!message) throw new Error('message obrigatoria');

  const contact = await Contact.findByPk(contact_id);
  if (!contact) throw new Error('Contact nao encontrado');

  const phone = contact.cellphone;
  // Mesmo header *Luma*\n usado pelo sendText (UX consistente — tutor não
  // vê diferença entre "sugestão IA aceita" e "texto livre" do painel).
  const fullText = `*${LUMA_NAME}*\n${message}`;

  const metaResp = await callMeta({
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: phone,
    type: 'text',
    text: { body: fullText, preview_url: false },
  });
  const messageId = metaResp?.messages?.[0]?.id;

  await logToHistory({
    name: LUMA_NAME,
    cell_phone: phone,
    journey: 'enviada',
    message,
    sent_by: 'petshop',
    message_type: 'text',
    message_id: messageId,
    path: 'petshop',
    user_id: user_id || null,
    contact_id,
    pet_owner_id: contact.pet_owner_id || undefined,
    clinic_id: contact.clinic_id || undefined,
    ai_output: message,
    is_modified: !!is_modificated,
  });

  // Luma assumiu via sugestão IA — set is_being_attended=true
  await ContactRepository.setAttendance({ contact_id, is_being_attended: true });

  return { success: true, message_id: messageId };
};

export default {
  sendText,
  sendTemplate,
  sendAISuggestion,
};
