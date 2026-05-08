// Template-create — fluxo de criação de template via LLM + Meta API.
//
// 1. draftFromDescription({ description }):
//      Chama OpenAI gpt-4.1-nano com prompt estruturado pra propor um
//      template WhatsApp (body + variáveis manuais + categoria + footer
//      sugerido). Retorna estrutura editável pelo operador.
//
// 2. submitToMeta({ name, body, manualVars, category, language, buttons }):
//      Submete pra Meta API (graph.facebook.com/{WABA_ID}/message_templates),
//      salva em templates table com status=PENDING. Manual_var_positions
//      preenchido pra que o frontend renderize inputs sem precisar editar
//      templateManualVars.js.

import axios from 'axios';
import { Template } from '../models/index.js';
import { sequelize } from '../../config/database.js';

const OPENAI_KEY = process.env.OPENAI_API_KEY;
const WABA_ID = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID || '2831596893680901';
const META_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN;
const WHATSAPP_API = 'https://graph.facebook.com/v21.0';

// Slug pro template_name técnico Meta. Letras minúsculas + underscores,
// max 60 chars. Prefixo luma_custom_ pra distinguir templates criados
// pela Luma via painel (vs. legados/marca).
function slugify(label) {
  const base = (label || 'template')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // remove acentos
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40);
  const stamp = Date.now().toString(36).slice(-6);
  return `luma_custom_${base}_${stamp}`;
}

const SYSTEM_PROMPT = `Você é um especialista em templates WhatsApp Business da Latta (marketplace pet brasileiro).

A Luma é a operadora humana que envia esses templates pelo painel. Templates Luma sempre começam com "*Luma*\\n" como header.

Sua tarefa: receber descrição do operador e propor um template estruturado em JSON. Regras Meta:
- Body max 1024 chars, mas mantenha 80-200 chars (UX WhatsApp curta)
- Variáveis {{1}}, {{2}}, ... NÃO podem ficar no início ou fim (Meta rejeita)
- Em PT-BR, tom natural e caloroso (sem "prezado(a)")
- Categoria: UTILITY (transacional, status, ajuda) ou MARKETING (promo, recompra, upsell)
- Variáveis manuais: o operador preenche na hora ({{1}} = primeiro nome do tutor SEMPRE auto-resolvido; {{2}}+ podem ser manuais)

Retorne APENAS JSON válido neste schema (sem markdown, sem comentários):
{
  "label": "string curta legível (ex: Lembrete vacina pendente)",
  "category": "UTILITY" | "MARKETING",
  "body": "*Luma*\\n\\nOi, {{1}}! ... {{2}} ... ",
  "manual_var_positions": [2, 3],
  "buttons": [{"type":"QUICK_REPLY","text":"Sim"}]
}`;

const USER_PROMPT_TEMPLATE = (description) =>
  `Descrição do operador: """${description}"""\n\nGere o template em JSON.`;

const draftFromDescription = async ({ description }) => {
  if (!description || !description.trim()) {
    throw new Error('description obrigatoria');
  }
  if (!OPENAI_KEY) {
    throw new Error('OPENAI_API_KEY nao configurado no backend');
  }

  const resp = await axios.post(
    'https://api.openai.com/v1/chat/completions',
    {
      model: 'gpt-4.1-nano',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: USER_PROMPT_TEMPLATE(description.trim()) },
      ],
      temperature: 0.4,
      response_format: { type: 'json_object' },
    },
    {
      headers: {
        Authorization: `Bearer ${OPENAI_KEY}`,
        'Content-Type': 'application/json',
      },
      timeout: 30000,
    },
  );

  const raw = resp.data?.choices?.[0]?.message?.content;
  if (!raw) throw new Error('LLM retornou resposta vazia');

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('LLM retornou JSON invalido');
  }

  // Validação mínima — schema Meta + safety
  if (!parsed.body || typeof parsed.body !== 'string') {
    throw new Error('LLM nao retornou body valido');
  }
  if (!['UTILITY', 'MARKETING'].includes(parsed.category)) {
    parsed.category = 'UTILITY'; // fallback safe
  }
  if (!Array.isArray(parsed.manual_var_positions)) {
    parsed.manual_var_positions = [];
  }
  if (!Array.isArray(parsed.buttons)) {
    parsed.buttons = [];
  }

  // Sugere nome técnico — frontend pode aceitar ou editar antes do submit
  const suggestedName = slugify(parsed.label);

  return {
    label: parsed.label || 'Template Luma',
    name: suggestedName,
    category: parsed.category,
    language: 'pt_BR',
    body: parsed.body,
    manual_var_positions: parsed.manual_var_positions,
    buttons: parsed.buttons,
  };
};

const submitToMeta = async ({
  name,
  label,
  body,
  category,
  language = 'pt_BR',
  manual_var_positions = [],
  buttons = [],
}) => {
  if (!name || !body || !label) {
    throw new Error('name, label e body obrigatorios');
  }
  if (!META_TOKEN) {
    throw new Error('WHATSAPP_ACCESS_TOKEN nao configurado');
  }

  // Monta example.body_text com placeholders genéricos pra cada {{N}}
  const varCount = (body.match(/\{\{(\d+)\}\}/g) || []).length;
  const exampleBody = Array.from({ length: varCount }, (_, i) => `valor${i + 1}`);

  const components = [
    {
      type: 'BODY',
      text: body,
      ...(varCount > 0 ? { example: { body_text: [exampleBody] } } : {}),
    },
  ];

  if (Array.isArray(buttons) && buttons.length > 0) {
    components.push({
      type: 'BUTTONS',
      buttons: buttons.slice(0, 3).map((b) => ({
        type: b.type || 'QUICK_REPLY',
        text: (b.text || 'OK').slice(0, 25),
      })),
    });
  }

  const metaPayload = {
    name,
    language,
    category,
    components,
  };

  let metaResp;
  try {
    const resp = await axios.post(
      `${WHATSAPP_API}/${WABA_ID}/message_templates`,
      metaPayload,
      {
        headers: {
          Authorization: `Bearer ${META_TOKEN}`,
          'Content-Type': 'application/json',
        },
        timeout: 20000,
      },
    );
    metaResp = resp.data;
  } catch (err) {
    const detail = err.response?.data?.error?.error_user_msg
      || err.response?.data?.error?.message
      || err.message;
    throw new Error(`Meta API rejeitou: ${detail}`);
  }

  // Extrai BODY pra template_preview (o que o frontend mostra na lista)
  const preview = body;

  // Salva no DB com status PENDING — será re-sincronizado quando Meta
  // notificar APPROVED via webhook (ou sync manual via npm run templates sync)
  await sequelize.query(
    `INSERT INTO templates
      (template_code, template_name, template_label, template_language,
       template_status, template_category, template_preview,
       components_json, manual_var_positions, submitted_at, updated_at)
     VALUES
      (:code, :name, :label, :language, :status, :category, :preview,
       :components, :manual_vars, NOW(), NOW())
     ON CONFLICT (template_name) DO UPDATE SET
       template_code = EXCLUDED.template_code,
       template_label = EXCLUDED.template_label,
       template_status = EXCLUDED.template_status,
       template_preview = EXCLUDED.template_preview,
       components_json = EXCLUDED.components_json,
       manual_var_positions = EXCLUDED.manual_var_positions,
       updated_at = NOW()`,
    {
      replacements: {
        code: metaResp.id || null,
        name,
        label,
        language,
        status: metaResp.status || 'PENDING',
        category,
        preview,
        components: JSON.stringify(components),
        manual_vars: `{${manual_var_positions.join(',')}}`,
      },
    },
  );

  return {
    success: true,
    meta_id: metaResp.id,
    status: metaResp.status || 'PENDING',
    name,
    label,
  };
};

export default {
  draftFromDescription,
  submitToMeta,
};
