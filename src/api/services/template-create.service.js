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
import { QueryTypes } from 'sequelize';
import { Template } from '../models/index.js';
import { sequelize } from '../../config/database.js';

const OPENAI_KEY = process.env.OPENAI_API_KEY;
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
// Aceita GEMINI_API_KEY (mesma var das EFs Supabase) ou
// GOOGLE_GENERATIVE_AI_API_KEY (declarada no .env.example do backend).
const GEMINI_KEY = process.env.GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY;
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

// Sanitiza erro do axios pra logs sem vazar Bearer token. Axios.toJSON()
// inclui o config completo (incluindo headers Authorization). console.error
// com o objeto err inteiro vaza a key — ja aconteceu uma vez nos logs do
// PM2 e foi flagrado.
function sanitizeAxiosError(err) {
  if (err.response) {
    const status = err.response.status;
    const code = err.response.data?.error?.code;
    const message = err.response.data?.error?.message;
    return new Error(`HTTP ${status}${code ? ` (${code})` : ''}: ${message || err.message}`);
  }
  return new Error(err.message || 'unknown axios error');
}

// Mapeia erro tecnico de provider em mensagem amigavel pro operador.
// 429 (insufficient_quota / rate_limit) tem causas distintas e o operador
// nao precisa saber qual; mensagem unica que sugere proxima a��ao.
function userFriendlyMessage(err) {
  const msg = err.message || '';
  if (msg.includes('429') || msg.includes('insufficient_quota')) {
    return 'A IA da Latta atingiu o limite agora. Tenta de novo em alguns minutos — se persistir, o time tecnico precisa renovar credito.';
  }
  if (msg.includes('401') || msg.includes('invalid_api_key')) {
    return 'A chave da IA nao esta configurada corretamente. Avise o time tecnico.';
  }
  if (msg.includes('timeout')) {
    return 'A IA demorou pra responder. Tenta de novo.';
  }
  return 'Nao foi possivel gerar o template agora. Tenta de novo em alguns minutos.';
}

// Provider order (escolha do user 2026-05): Gemini Flash → Claude Haiku
// → OpenAI nano. Gemini tem free tier generoso (60 RPM, 1500 RPD), entao
// e a primeira opcao. Os 2 pagos viram fallback.
async function callGemini(description) {
  // gemini-2.5-flash: estavel, rapido, ~$0.075/1M input tokens (free tier
  // cobre uso esporadico do painel sem custo).
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_KEY}`;
  const resp = await axios.post(
    url,
    {
      contents: [{ parts: [{ text: USER_PROMPT_TEMPLATE(description) }] }],
      systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
      generationConfig: {
        temperature: 0.4,
        responseMimeType: 'application/json',
      },
    },
    {
      headers: { 'Content-Type': 'application/json' },
      timeout: 30000,
    },
  );
  return resp.data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

async function callAnthropic(description) {
  const resp = await axios.post(
    'https://api.anthropic.com/v1/messages',
    {
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 800,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: USER_PROMPT_TEMPLATE(description) }],
    },
    {
      headers: {
        'x-api-key': ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      timeout: 30000,
    },
  );
  // Anthropic retorna content[0].text — extrair JSON dele. Como nao tem
  // response_format=json, o LLM pode incluir markdown — strip se necessario.
  let raw = resp.data?.content?.[0]?.text || '';
  raw = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
  return raw;
}

async function callOpenAI(description) {
  const resp = await axios.post(
    'https://api.openai.com/v1/chat/completions',
    {
      model: 'gpt-4.1-nano',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: USER_PROMPT_TEMPLATE(description) },
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
  return resp.data?.choices?.[0]?.message?.content || '';
}

const draftFromDescription = async ({ description }) => {
  if (!description || !description.trim()) {
    throw new Error('description obrigatoria');
  }
  if (!GEMINI_KEY && !ANTHROPIC_KEY && !OPENAI_KEY) {
    throw new Error('Nenhuma chave de IA configurada (GEMINI_API_KEY, ANTHROPIC_API_KEY ou OPENAI_API_KEY)');
  }

  const cleaned = description.trim();

  // Cadeia de providers (escolha do user 2026-05):
  //   1. Gemini 2.5 Flash — free tier generoso (1500 RPD)
  //   2. Anthropic Claude Haiku 4.5 — fallback se Gemini falhar
  //   3. OpenAI gpt-4.1-nano — ultimo fallback
  let raw = '';
  let lastError = null;
  if (GEMINI_KEY) {
    try {
      raw = await callGemini(cleaned);
    } catch (err) {
      lastError = sanitizeAxiosError(err);
      console.warn('[template-create] Gemini falhou:', lastError.message);
    }
  }
  if (!raw && ANTHROPIC_KEY) {
    try {
      raw = await callAnthropic(cleaned);
    } catch (err) {
      lastError = sanitizeAxiosError(err);
      console.warn('[template-create] Anthropic falhou:', lastError.message);
    }
  }
  if (!raw && OPENAI_KEY) {
    try {
      raw = await callOpenAI(cleaned);
    } catch (err) {
      lastError = sanitizeAxiosError(err);
      console.warn('[template-create] OpenAI falhou:', lastError.message);
    }
  }
  if (!raw) {
    const friendlyError = new Error(userFriendlyMessage(lastError || new Error('')));
    friendlyError.cause = lastError;
    throw friendlyError;
  }

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
    // sanitize: NUNCA throw com err inteiro — config.headers expoe token
    const detail = err.response?.data?.error?.error_user_msg
      || err.response?.data?.error?.message
      || err.message;
    const safe = new Error(`Meta API rejeitou: ${detail}`);
    throw safe;
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

// Soft delete — marca template_status='ARCHIVED'. Mantem registro do
// template_components / template_variables / chat_history pra preservar
// historico de mensagens enviadas (FK constraint impediria DELETE hard
// de qualquer jeito). Frontend filtra ARCHIVED no getAllTemplates.
const archiveTemplate = async ({ id }) => {
  if (!id) throw new Error('id obrigatorio');
  const [_, meta] = await sequelize.query(
    `UPDATE templates
     SET template_status = 'ARCHIVED', updated_at = NOW()
     WHERE id = :id
     RETURNING id, template_name, template_status`,
    { replacements: { id } },
  );
  if (!meta?.rowCount) {
    throw new Error('Template nao encontrado');
  }
  return { success: true, archived: meta.rowCount };
};

// Sincroniza status dos templates luma_custom_* PENDING/REJECTED com a Meta
// API. Frontend chama isso ao abrir o modal pra refletir aprovacoes recentes
// sem esperar webhook Meta. Limita a templates do painel pra nao bater Meta
// API toa pros legados que nao mudam.
const syncPendingTemplates = async () => {
  if (!META_TOKEN) {
    return { synced: 0, skipped: 0, reason: 'no_meta_token' };
  }

  const pending = await sequelize.query(
    `SELECT id, template_code, template_name, template_status
     FROM templates
     WHERE template_name LIKE 'luma_custom_%'
       AND template_status IN ('PENDING', 'REJECTED')
       AND template_code IS NOT NULL`,
    { type: QueryTypes.SELECT },
  );

  if (pending.length === 0) {
    return { synced: 0, skipped: 0 };
  }

  let synced = 0;
  let skipped = 0;
  for (const tpl of pending) {
    try {
      // GET /{template_id} retorna { name, status, language, components, ... }
      const resp = await axios.get(
        `${WHATSAPP_API}/${tpl.template_code}`,
        {
          headers: { Authorization: `Bearer ${META_TOKEN}` },
          timeout: 10000,
        },
      );
      const newStatus = resp.data?.status;
      if (newStatus && newStatus !== tpl.template_status) {
        await sequelize.query(
          `UPDATE templates SET template_status = :status, updated_at = NOW()
           WHERE id = :id`,
          {
            replacements: { status: newStatus, id: tpl.id },
          },
        );
        synced++;
      } else {
        skipped++;
      }
    } catch (err) {
      console.warn(`[template-sync] ${tpl.template_name} falhou:`, err.message);
      skipped++;
    }
  }

  return { synced, skipped, total: pending.length };
};

export default {
  draftFromDescription,
  submitToMeta,
  syncPendingTemplates,
  archiveTemplate,
};
