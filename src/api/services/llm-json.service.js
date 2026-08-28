/* ============================================================================
 * PEDIR JSON A UM MODELO DE TEXTO — a cadeia de providers, num lugar só
 * ============================================================================
 *
 * Extraído do `template-create.service.js`, que era o único lugar do backend a
 * fazer isso. A ordem dos providers, os timeouts, a limpeza do erro e a
 * mensagem amigável são os mesmos de lá — este arquivo não muda comportamento,
 * muda de dono.
 *
 * 🚨 POR QUE EXTRAIR EM VEZ DE COPIAR. O segundo chamador (o briefing de
 * campanha) precisaria da mesma cadeia, e cadeia de provider duplicada é a
 * família de defeito mais cara desta casa: a cópia envelhece, alguém troca o
 * modelo num arquivo só, e o sintoma aparece meses depois como "às vezes
 * funciona". A gêmea do `cleanPersonName` existe com guard byte a byte
 * justamente porque duplicar isso já deu errado antes.
 *
 * Ordem, decidida pelo Lucas em 05/2026 e mantida:
 *   1. Gemini 2.5 Flash — free tier generoso (1500 RPD), então é a primeira
 *   2. Claude Haiku 4.5 — fallback
 *   3. gpt-4.1-nano      — último recurso
 *
 * 🚨 O `sanitizeAxiosError` NÃO é zelo abstrato. `axios.toJSON()` inclui o
 * config inteiro, com o header `Authorization`, e `console.error(err)` já vazou
 * a chave nos logs do pm2 uma vez. Erro daqui sai com status e mensagem, nunca
 * com o objeto.
 * ============================================================================ */

import axios from 'axios';

const chaves = () => ({
  gemini: process.env.GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY,
  anthropic: process.env.ANTHROPIC_API_KEY,
  openai: process.env.OPENAI_API_KEY,
});

const TIMEOUT = 30000;

export const sanitizeAxiosError = (err) => {
  if (err?.response) {
    const status = err.response.status;
    const code = err.response.data?.error?.code;
    const message = err.response.data?.error?.message;
    return new Error(`HTTP ${status}${code ? ` (${code})` : ''}: ${message || err.message}`);
  }
  return new Error(err?.message || 'unknown axios error');
};

/**
 * O erro técnico virado frase pro operador.
 *
 * 429 tem causas distintas (cota estourada, rate limit) e o operador não
 * precisa saber qual: o que ele precisa é da próxima ação.
 */
export const mensagemAmigavel = (err) => {
  const msg = err?.message || '';
  if (msg.includes('429') || msg.includes('insufficient_quota')) {
    return 'A IA da Latta atingiu o limite agora. Tenta de novo em alguns minutos — se persistir, o time tecnico precisa renovar credito.';
  }
  if (msg.includes('401') || msg.includes('invalid_api_key')) {
    return 'A chave da IA nao esta configurada corretamente. Avise o time tecnico.';
  }
  if (msg.includes('timeout')) {
    return 'A IA demorou pra responder. Tenta de novo.';
  }
  return 'Nao foi possivel falar com a IA agora. Tenta de novo em alguns minutos.';
};

const chamarGemini = async ({ system, user, temperatura }) => {
  const resp = await axios.post(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${chaves().gemini}`,
    {
      contents: [{ parts: [{ text: user }] }],
      systemInstruction: { parts: [{ text: system }] },
      generationConfig: { temperature: temperatura, responseMimeType: 'application/json' },
    },
    { headers: { 'Content-Type': 'application/json' }, timeout: TIMEOUT },
  );
  return resp.data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
};

const chamarAnthropic = async ({ system, user, maxTokens }) => {
  const resp = await axios.post(
    'https://api.anthropic.com/v1/messages',
    {
      model: 'claude-haiku-4-5-20251001',
      max_tokens: maxTokens,
      system,
      messages: [{ role: 'user', content: user }],
    },
    {
      headers: {
        'x-api-key': chaves().anthropic,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      timeout: TIMEOUT,
    },
  );
  // Sem `response_format`, o modelo pode embrulhar em markdown. Tira a cerca
  // antes de devolver, senão o JSON.parse do caller quebra por causa de três
  // crases.
  return String(resp.data?.content?.[0]?.text || '')
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
    .trim();
};

const chamarOpenAI = async ({ system, user, temperatura }) => {
  const resp = await axios.post(
    'https://api.openai.com/v1/chat/completions',
    {
      model: 'gpt-4.1-nano',
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      temperature: temperatura,
      response_format: { type: 'json_object' },
    },
    {
      headers: { Authorization: `Bearer ${chaves().openai}`, 'Content-Type': 'application/json' },
      timeout: TIMEOUT,
    },
  );
  return resp.data?.choices?.[0]?.message?.content || '';
};

/**
 * Pede JSON, descendo a cadeia até alguém responder.
 *
 * Devolve o objeto já parseado. Quem chama valida o CONTEÚDO — este módulo só
 * garante que veio JSON de alguém.
 */
export const pedirJson = async ({ system, user, temperatura = 0.4, maxTokens = 1200, marca = 'llm' }) => {
  const k = chaves();
  if (!k.gemini && !k.anthropic && !k.openai) {
    throw new Error('Nenhuma chave de IA configurada (GEMINI_API_KEY, ANTHROPIC_API_KEY ou OPENAI_API_KEY)');
  }

  const cadeia = [
    ['Gemini', k.gemini, chamarGemini],
    ['Anthropic', k.anthropic, chamarAnthropic],
    ['OpenAI', k.openai, chamarOpenAI],
  ];

  let bruto = '';
  let ultimoErro = null;
  let provider = null;
  for (const [nome, chave, chamar] of cadeia) {
    if (bruto || !chave) continue;
    try {
      // eslint-disable-next-line no-await-in-loop
      bruto = await chamar({ system, user, temperatura, maxTokens });
      if (bruto) provider = nome;
    } catch (err) {
      ultimoErro = sanitizeAxiosError(err);
      console.warn(`[${marca}] ${nome} falhou:`, ultimoErro.message);
    }
  }

  if (!bruto) {
    const amigavel = new Error(mensagemAmigavel(ultimoErro || new Error('')));
    amigavel.cause = ultimoErro;
    throw amigavel;
  }

  try {
    return { json: JSON.parse(bruto), provider };
  } catch {
    throw new Error('A IA respondeu num formato que nao deu pra ler. Tenta de novo.');
  }
};

export default { pedirJson, sanitizeAxiosError, mensagemAmigavel };
