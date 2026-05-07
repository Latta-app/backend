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

import axios from 'axios';
import { Contact, PetOwner, Pet, Template, TemplateVariable, TemplateVariableType } from '../models/index.js';
import ContactRepository from '../repositories/contact.repository.js';

const PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID || '587778224419344';
const WHATSAPP_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN;
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://kusqorpjtadcuooprpqb.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const WHATSAPP_PROXY_URL = `${SUPABASE_URL}/functions/v1/whatsapp-proxy?target=https://graph.facebook.com/v21.0/${PHONE_NUMBER_ID}/messages`;
const CHAT_HISTORY_LOGGER_URL = `${SUPABASE_URL}/functions/v1/chat-history-logger`;

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

async function callMeta(payload) {
  const resp = await axios.post(WHATSAPP_PROXY_URL, payload, {
    headers: {
      'Authorization': `Bearer ${WHATSAPP_TOKEN}`,
      'Content-Type': 'application/json',
    },
    timeout: 15000,
  });
  return resp.data;
}

async function logToHistory(row) {
  // Fire-and-forget: erro de log não bloqueia envio (mensagem já foi pra Meta).
  // Tutor recebe; mensageria fica fora-de-sync por minutos no pior caso.
  try {
    await axios.post(CHAT_HISTORY_LOGGER_URL, row, {
      headers: {
        'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
      },
      timeout: 5000,
    });
  } catch (err) {
    console.warn('[messaging] logToHistory failed:', err?.message || err);
  }
}

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
    petOwner = await PetOwner.findByPk(contact.pet_owner_id);
    if (petOwner) {
      pet = await Pet.findOne({
        where: { pet_owner_id: petOwner.id },
        order: [['created_at', 'ASC']],
      });
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

  return { success: true, message_id: messageId, template_name: template.template_name };
};

export default {
  sendText,
  sendTemplate,
};
