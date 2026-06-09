// Petz cookie minter — fatia #01 de petz-connect-mandatory-onboarding.
//
// Minta cookies de sessão Petz (ingress-session-affinity + JSESSIONID) com um
// browser real (Akamai exige JS), valida via health check (/access != 403) e
// grava no pool `petz_session_pool` (Postgres, via Supabase REST). A EF lê um
// slot healthy pra fazer chamadas Petz CRUAS sem browser por usuário.
//
// Roda como job agendado (cron). NÃO usa Stagehand/Browserbase (sem LLM, sem
// custo cloud): só carrega a página de login e captura cookies.
//
// Env:
//   PETZ_PROXY                  http://user:pass@host:port  (proxy residencial BR, mesmo da EF)
//   SUPABASE_URL                https://<proj>.supabase.co
//   SUPABASE_SERVICE_ROLE_KEY   service role (bypass RLS)
//   PETZ_POOL_SIZE              nº de slots a manter (default 1)
//   PETZ_COOKIE_TTL_MIN        TTL conservador do cookie em min (default 25)
//
// Uso: node src/jobs/petz-cookie-minter.js   (ou via cron a cada ~15-20min)
// Ref: docs/issues/petz-connect-mandatory-onboarding/README.md, ADR-0008.

import 'dotenv/config';
import https from 'https';
import { Stagehand } from '@browserbasehq/stagehand';
import proxyAgentPkg from 'https-proxy-agent';

// https-proxy-agent: v7 exporta { HttpsProxyAgent }; versões antigas exportam a
// classe como default. Suporta os dois.
const HttpsProxyAgent = proxyAgentPkg.HttpsProxyAgent || proxyAgentPkg;

const PETZ_PROXY = process.env.PETZ_PROXY;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const POOL_SIZE = parseInt(process.env.PETZ_POOL_SIZE || '1', 10);
const TTL_MIN = parseInt(process.env.PETZ_COOKIE_TTL_MIN || '25', 10);

const BASE = 'https://www.petz.com.br';
const LOGIN_URL = `${BASE}/checkout/login/indexLogado_Loja`;
const ACCESS_URL = `${BASE}/api/v3/public/client/access`;
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36';

function requireEnv() {
  const missing = ['PETZ_PROXY', 'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'].filter((k) => !process.env[k]);
  if (missing.length) { console.error(`[minter] faltam envs: ${missing.join(', ')}`); process.exit(1); }
}

// 1) Minta cookie de sessão via browser STEALTH (Stagehand + Browserbase).
//
// Decisão (README §11, ADR-0008): mint headless "puro" é flaky contra o Akamai
// (IPs residenciais esquentam → 403). Usamos a MESMA infra stealth do login Petz
// (web-scrapping.service.js): Browserbase vence o bot-detection de forma robusta.
//
// ⚠️ QUESTÃO ABERTA A VALIDAR NO DEPLOY (IP-binding): o cookie é mintado pelo IP
// de saída do Browserbase. As chamadas CRUAS da EF (fatia #02) saem pelo IProyal
// (outro IP). Na validação 2 o cookie funcionou cru cross-process, mas sob volume
// o Akamai pode exigir o MESMO egress. Se der 403 nas chamadas cruas da EF:
//   - opção 1: rodar o Browserbase atrás do MESMO IProyal (sticky BR) das chamadas
//     cruas, via browserbaseSessionCreateParams.proxies;
//   - opção 2: fazer access/send/verify TAMBÉM dentro do browser (sem chamada crua),
//     reidratando o cookie numa sessão Browserbase nova no verify.
// O health check abaixo (chamada crua /access) já exercita exatamente esse cenário
// cross-IP — se passar (200/app), a arquitetura cookie→EF-cru está validada.
export async function mintCookie() {
  const useCloud = process.env.USE_BROWSERBASE === 'true';
  const stagehand = new Stagehand({
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
            ...(process.env.PETZ_PROXY ? (() => { const u = new URL(PETZ_PROXY); return { proxy: { server: `http://${u.host}`, username: decodeURIComponent(u.username), password: decodeURIComponent(u.password) } }; })() : {}),
          },
        }),
  });
  await stagehand.init();
  try {
    const page = stagehand.page;
    await page.goto(LOGIN_URL, { waitUntil: 'networkidle', timeout: 60000 });
    await page.waitForTimeout(2500);
    const cookies = await page.context().cookies(BASE);
    if (!cookies.some((c) => c.name === 'JSESSIONID')) {
      throw new Error('cookie de sessão (JSESSIONID) não veio — Akamai pode ter bloqueado');
    }
    return cookies.map((c) => `${c.name}=${c.value}`).join('; ');
  } finally {
    await stagehand.close();
  }
}

// 2) Health check: /access cru com CPF bogus. Healthy se NÃO for 403 do Akamai.
export function healthCheck(cookieHeader) {
  return new Promise((resolve) => {
    const data = JSON.stringify({ cpf: '00000000000', tipoToken: 'access_token' });
    const req = https.request(ACCESS_URL, {
      method: 'POST',
      agent: new HttpsProxyAgent(PETZ_PROXY),
      headers: {
        'content-type': 'application/json; charset=UTF-8', 'versionapi': '3', 'user-agent': UA,
        'origin': BASE, 'referer': LOGIN_URL, 'cookie': cookieHeader, 'content-length': Buffer.byteLength(data),
      },
    }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const body = Buffer.concat(chunks).toString();
        const akamaiBlocked = res.statusCode === 403 || /Access Denied/i.test(body);
        resolve({ ok: !akamaiBlocked, status: res.statusCode });
      });
    });
    req.on('error', (e) => resolve({ ok: false, status: 0, error: e.message }));
    req.write(data); req.end();
  });
}

// 3) Upsert do slot no pool via Supabase REST.
async function storeSlot(slot, cookieHeader, healthy) {
  const now = new Date();
  const row = {
    slot,
    cookie_header: cookieHeader,
    minted_at: now.toISOString(),
    expires_at: new Date(now.getTime() + TTL_MIN * 60_000).toISOString(),
    healthy,
    last_health_at: now.toISOString(),
  };
  const res = await fetch(`${SUPABASE_URL}/rest/v1/petz_session_pool?on_conflict=slot`, {
    method: 'POST',
    headers: {
      'apikey': SERVICE_KEY, 'Authorization': `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json', 'Prefer': 'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify(row),
  });
  if (!res.ok) throw new Error(`store slot ${slot}: ${res.status} ${await res.text()}`);
}

async function run() {
  requireEnv();
  let okCount = 0;
  for (let slot = 1; slot <= POOL_SIZE; slot++) {
    try {
      const cookie = await mintCookie();
      const hc = await healthCheck(cookie);
      await storeSlot(slot, cookie, hc.ok);
      console.log(`[minter] slot ${slot}: minted, health=${hc.ok ? 'OK' : 'FAIL'} (status ${hc.status}), stored`);
      if (hc.ok) okCount++;
    } catch (err) {
      console.error(`[minter] slot ${slot} falhou: ${err.message}`);
    }
  }
  console.log(`[minter] done — ${okCount}/${POOL_SIZE} slots healthy`);
  process.exit(okCount > 0 ? 0 : 1);
}

// Auto-run só quando invocado direto (não quando importado em teste).
if (import.meta.url === `file://${process.argv[1]}`) run();
