// Lookup do número mascarado da conta Petz via /access (diligência "final XXXX").
//
// O /access (`/api/v3/public/client/access`) é Akamai-protegido — 403 em chamada
// crua, mesmo via IProyal. A única forma de passar é DENTRO de um browser stealth
// (Browserbase), que o Akamai aceita. Esta é uma chamada única e curta (~15-17s):
// abre a página de login, dispara o /access in-browser, devolve o mascarado.
// NÃO mantém sessão viva (diferente do antigo worker B de OTP). Latência medida
// 2026-06-10: ~17s (init ~5s + page load ~10s + fetch ~1s).

import 'dotenv/config';
import { Stagehand } from '@browserbasehq/stagehand';

const PETZ_BASE = 'https://www.petz.com.br';
const LOGIN_URL = `${PETZ_BASE}/checkout/login/indexLogado_Loja`;

function newStagehand() {
  const useCloud = process.env.USE_BROWSERBASE === 'true';
  return new Stagehand({
    env: useCloud ? 'BROWSERBASE' : 'LOCAL',
    apiKey: process.env.BROWSERBASE_API_KEY,
    projectId: process.env.BROWSERBASE_PROJECT_ID,
    enableCaching: false,
    ...(useCloud
      ? { browserbaseSessionCreateParams: { keepAlive: false, timeout: 120 } }
      : {
          localBrowserLaunchOptions: {
            headless: true,
            ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}),
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--lang=pt-BR'],
          },
        }),
  });
}

/**
 * Identifica a conta Petz pelo CPF e devolve o número mascarado cadastrado.
 * @param {{cpf: string}} params
 * @returns {Promise<{exists: boolean, maskedPhone: string|null, hasWppRetry: boolean}>}
 */
export async function lookupMaskedPhone({ cpf }) {
  const stagehand = newStagehand();
  await stagehand.init();
  const page = stagehand.page;
  try {
    await page.goto(LOGIN_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
    const out = await page.evaluate(async (cpf) => {
      const r = await fetch('/api/v3/public/client/access', {
        method: 'POST',
        headers: { 'content-type': 'application/json; charset=UTF-8', versionapi: '3' },
        body: JSON.stringify({ cpf, tipoToken: 'access_token' }),
      });
      let d = null;
      try { d = await r.json(); } catch { /* ok */ }
      return { status: r.status, data: d };
    }, cpf);

    const ca = out?.data?.result?.clientAccess;
    return {
      exists: !!ca,
      maskedPhone: ca?.cellphone ?? null,
      hasWppRetry: !!ca?.hasWppRetry,
    };
  } finally {
    await stagehand.close().catch(() => {});
  }
}
