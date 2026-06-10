// Petz OTP "quick-access" all-in-browser (caminho B de petz-connect-mandatory-onboarding).
//
// Diferente do login por senha (web-scrapping.service.js), este fluxo é o
// passwordless OTP da Petz, usado pra CONECTAR conta existente no onboarding:
//   1) /access            -> número CADASTRADO mascarado (diligência Q1)
//   2) otp send (SMS|WPP)  -> envia o código (WhatsApp imediato)
//   3) auth verify          -> valida o código e conecta
//
// TUDO dentro do Browserbase (stealth vence o Akamai; o IP do Browserbase passa).
// Não usamos chamadas cruas da EF porque o Akamai exige egress consistente e o
// Browserbase não roteia external proxy nesta conta (ver issue §11, caminho A
// bloqueado). A sessão fica VIVA entre o send e o verify (keepAlive), igual ao
// login runner — o tutor manda o código no chat e a gente verifica na mesma sessão.
//
// Endpoints validados 2026-06-05 (issue §2):
//   POST /api/v3/public/client/access     {cpf, tipoToken}
//   POST /api/v4/otp/public/quick-access  {identifier, contactMethod: 'SMS'|'WPP'}
//   POST /api/v4/auth/quick-access        {customerKey, accessCode}

import 'dotenv/config';
import { Stagehand } from '@browserbasehq/stagehand';

const PETZ_BASE = 'https://www.petz.com.br';
const LOGIN_URL = `${PETZ_BASE}/checkout/login/indexLogado_Loja`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function newStagehand() {
  const useCloud = process.env.USE_BROWSERBASE === 'true';
  return new Stagehand({
    env: useCloud ? 'BROWSERBASE' : 'LOCAL',
    apiKey: process.env.BROWSERBASE_API_KEY,
    projectId: process.env.BROWSERBASE_PROJECT_ID,
    enableCaching: false,
    ...(useCloud
      ? { browserbaseSessionCreateParams: { keepAlive: true, timeout: 300 } }
      : {
          localBrowserLaunchOptions: {
            headless: true,
            ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}),
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--lang=pt-BR'],
          },
        }),
  });
}

// fetch in-browser (passa pelo contexto Akamai-válido da sessão já aquecida)
async function browserPost(page, path, body) {
  return page.evaluate(async ({ path, body }) => {
    const r = await fetch(path, {
      method: 'POST',
      headers: { 'content-type': 'application/json; charset=UTF-8', versionapi: '3' },
      body: JSON.stringify(body),
    });
    let data = null;
    try { data = await r.json(); } catch { /* corpo pode não ser JSON */ }
    return { status: r.status, data };
  }, { path, body });
}

/**
 * Abre a sessão, identifica a conta (masked) e ENVIA o código pelo canal pedido.
 * Mantém a sessão VIVA (retorna stagehand+page) pro verify subsequente.
 * @returns {Promise<{stagehand,page,exists,maskedPhone,hasWppRetry,sendStatus}>}
 */
export async function startPetzOtp({ cpf, channel = 'SMS' }) {
  const stagehand = newStagehand();
  await stagehand.init();
  const page = stagehand.page;
  try {
    await page.goto(LOGIN_URL, { waitUntil: 'networkidle', timeout: 90000 });
    await sleep(2500);

    // 1) abre o modal de acesso rápido + dispara o /access da PRÓPRIA página
    //    (aquece o sensor Akamai e devolve o número mascarado)
    await page.click('text=Receber código de acesso rápido', { timeout: 15000 });
    await sleep(1500);
    await page.evaluate((c) => {
      const i = [...document.querySelectorAll('input')].find(
        (x) => x.offsetParent !== null && x.type !== 'password' && x.id !== 'loginEmail',
      );
      if (i) { i.focus(); i.value = c; i.dispatchEvent(new Event('input', { bubbles: true })); i.dispatchEvent(new Event('change', { bubbles: true })); }
    }, cpf);
    await sleep(600);
    const [accessResp] = await Promise.all([
      page.waitForResponse((r) => r.url().includes('/api/v3/public/client/access'), { timeout: 20000 }).catch(() => null),
      page.click('text=Continuar', { timeout: 10000 }),
    ]);
    let exists = false, maskedPhone = null, hasWppRetry = false;
    if (accessResp && accessResp.status() === 200) {
      const body = await accessResp.json().catch(() => null);
      const ca = body?.result?.clientAccess;
      exists = !!ca;
      maskedPhone = ca?.cellphone ?? null;
      hasWppRetry = !!ca?.hasWppRetry;
    }
    await sleep(500);

    // 2) envia o código pelo canal (sessão já aquecida → fetch in-browser passa)
    const send = await browserPost(page, '/api/v4/otp/public/quick-access', {
      identifier: cpf,
      contactMethod: channel === 'WPP' ? 'WPP' : 'SMS',
    });

    return { stagehand, page, exists, maskedPhone, hasWppRetry, sendStatus: send.status };
  } catch (err) {
    await stagehand.close().catch(() => {});
    throw err;
  }
}

/**
 * Verifica o código NA MESMA sessão viva do startPetzOtp e reconcilia os tokens
 * que o cart/checkout usam. Protocolo validado 2026-06-05/10 (ver issue
 * petz-connect-mandatory-onboarding/SMOKE-VALIDATED-2026-06-10.md):
 *   1) POST /api/v4/auth/quick-access {customerKey, accessCode}
 *      headers: X-Use-Otp-Validation:true + Device-Id (cookie device_id)
 *      -> 200 {access_token, refresh_token, expires_in}
 *   2) GET /api/v3/client/get_by_token
 *      headers: X-Authorization: Bearer <access_token> + Authorization Basic (app) + Device-Id
 *      -> result.client.id = petz_client_id
 * O header X-Use-Otp-Validation é OBRIGATÓRIO no verify — sem ele o endpoint
 * retorna 401 "Código não encontrado".
 * @returns {Promise<{success:boolean,status:number,accessToken?:string,refreshToken?:string,expiresIn?:number,petzClientId?:string,deviceId?:string,data:unknown}>}
 */
export async function verifyPetzOtp({ page, cpf, code }) {
  const out = await page.evaluate(async ({ cpf, code }) => {
    const deviceId = (document.cookie.match(/(?:^|;\s*)device_id=([^;]+)/) || [])[1] || '';
    // 1) verify
    const vr = await fetch('/api/v4/auth/quick-access', {
      method: 'POST',
      headers: {
        'content-type': 'application/json; charset=UTF-8',
        'X-Use-Otp-Validation': 'true',
        'Device-Id': deviceId,
      },
      body: JSON.stringify({ customerKey: cpf, accessCode: code }),
    });
    let vdata = null;
    try { vdata = await vr.json(); } catch { /* ok */ }
    if (vr.status !== 200 || !vdata?.access_token) {
      return { status: vr.status, data: vdata, deviceId };
    }
    // 2) client id via token (mesmo Bearer que o cart usa)
    let petzClientId = null;
    try {
      const cr = await fetch('/api/v3/client/get_by_token', {
        headers: {
          'X-Authorization': `Bearer ${vdata.access_token}`,
          Authorization: 'Basic cGV0ejpwZXR6MTAxMA==',
          'Device-Id': deviceId,
          'content-type': 'application/json; charset=UTF-8',
        },
      });
      const cdata = await cr.json().catch(() => null);
      const client = cdata?.result?.client || cdata?.client || null;
      if (client?.id != null) petzClientId = String(client.id);
    } catch { /* enrichment é best-effort; cart resolve via fallback */ }
    return { status: vr.status, data: vdata, deviceId, petzClientId };
  }, { cpf, code });

  if (out.status !== 200 || !out.data?.access_token) {
    return { success: false, status: out.status, data: out.data };
  }
  return {
    success: true,
    status: out.status,
    accessToken: out.data.access_token,
    refreshToken: out.data.refresh_token,
    expiresIn: out.data.expires_in ?? 3600,
    petzClientId: out.petzClientId ?? null,
    deviceId: out.deviceId || null,
    data: out.data,
  };
}

export async function closePetzOtp(stagehand) {
  try { await stagehand?.close(); } catch { /* ok */ }
}
