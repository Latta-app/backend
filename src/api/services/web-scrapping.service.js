import 'dotenv/config';
import { Stagehand } from '@browserbasehq/stagehand';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const setValueUnsafe = async (page, selector, value) => {
  const ok = await page.evaluate(
    ({ selector, value }) => {
      const el = document.querySelector(selector);
      if (!el) return false;

      el.value = String(value);
      el.dispatchEvent(new Event('input', { bubbles: true }));

      return el.value === String(value);
    },
    { selector, value },
  );

  if (!ok) throw new Error(`SET_VALUE_FAILED ${selector}`);
};

const clickUnsafe = async (page, selector) => {
  await page.evaluate((selector) => {
    const el = document.querySelector(selector);
    el?.click();
  }, selector);
};

export const runLoginFlow = async ({ email, password, sessionId, force = false }) => {
  let stagehand;
  let page;

  try {
    console.log('🔐 [SERVICE] Modo: CLOUD');

    const useCloud = process.env.USE_BROWSERBASE === 'true';
    console.log(`🔐 [SERVICE] Modo: ${useCloud ? 'CLOUD' : 'LOCAL'}`);

    stagehand = new Stagehand({
      env: useCloud ? 'BROWSERBASE' : 'LOCAL',
      apiKey: process.env.BROWSERBASE_API_KEY,
      projectId: process.env.BROWSERBASE_PROJECT_ID,
      enableCaching: false,
      ...(useCloud
        ? {
            browserbaseSessionCreateParams: { keepAlive: true, timeout: 300 },
          }
        : {
            localBrowserLaunchOptions: {
              headless: false,
              args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
            },
          }),
    });

    await stagehand.init();
    page = stagehand.page;

    // ✅ FORCE: reset TOTAL antes de logar
    if (force) {
      const t0 = Date.now();
      console.log('🧹 [FORCE] Iniciando cleanup (cookies + storages + caches)');

      try {
        const ctx = page.context();

        // 1) cookies
        console.log('🧹 [FORCE] (1/4) Lendo cookies do contexto...');
        const beforeCookies = await ctx.cookies().catch(() => []);
        console.log(`🧹 [FORCE] Cookies antes: ${beforeCookies.length}`);

        if (beforeCookies.length) {
          const tCookies = Date.now();
          await ctx.clearCookies().catch((e) => {
            throw new Error(`CLEAR_COOKIES_FAILED: ${e?.message || String(e)}`);
          });

          const afterCookies = await ctx.cookies().catch(() => []);
          console.log(
            `🧹 [FORCE] Cookies limpos em ${Date.now() - tCookies}ms | depois: ${
              afterCookies.length
            }`,
          );
        } else {
          console.log('🧹 [FORCE] Sem cookies para limpar');
        }

        // 2) navega pra origem raiz
        console.log('🧹 [FORCE] (2/4) Indo para HOME (origem raiz) para limpar storages...');
        const tGoto = Date.now();
        await page.goto('https://www.petz.com.br/', { waitUntil: 'domcontentloaded' });
        console.log(`🧹 [FORCE] HOME carregada em ${Date.now() - tGoto}ms | url=${page.url()}`);

        // 3) storages + caches
        console.log('🧹 [FORCE] (3/4) Limpando localStorage/sessionStorage/caches...');
        const tStor = Date.now();
        const cleared = await page.evaluate(async () => {
          const result = {
            localStorage: { ok: false, itemsBefore: null },
            sessionStorage: { ok: false, itemsBefore: null },
            caches: { ok: false, keysBefore: null, deleted: 0 },
          };

          // localStorage
          try {
            result.localStorage.itemsBefore = localStorage.length;
            localStorage.clear();
            result.localStorage.ok = true;
          } catch {}

          // sessionStorage
          try {
            result.sessionStorage.itemsBefore = sessionStorage.length;
            sessionStorage.clear();
            result.sessionStorage.ok = true;
          } catch {}

          // caches
          try {
            if ('caches' in window) {
              const keys = await caches.keys();
              result.caches.keysBefore = keys.length;
              await Promise.all(keys.map((k) => caches.delete(k)));
              result.caches.deleted = keys.length;
              result.caches.ok = true;
            } else {
              result.caches.keysBefore = 0;
              result.caches.ok = true; // "ok" porque não existe mesmo
            }
          } catch {}

          return result;
        });

        console.log(
          `🧹 [FORCE] Storages/caches limpos em ${Date.now() - tStor}ms | ` +
            `localStorage=${cleared.localStorage.ok ? 'ok' : 'fail'}(antes=${
              cleared.localStorage.itemsBefore
            }) | ` +
            `sessionStorage=${cleared.sessionStorage.ok ? 'ok' : 'fail'}(antes=${
              cleared.sessionStorage.itemsBefore
            }) | ` +
            `caches=${cleared.caches.ok ? 'ok' : 'fail'}(keysAntes=${
              cleared.caches.keysBefore
            }, deletados=${cleared.caches.deleted})`,
        );

        // 4) respiro
        console.log('🧹 [FORCE] (4/4) Aguardando 1200ms (respiro)...');
        await sleep(1200);

        console.log(`✅ [FORCE] Cleanup concluído em ${Date.now() - t0}ms`);
      } catch (e) {
        console.log(`⚠️ [FORCE] Cleanup falhou em ${Date.now() - t0}ms:`, e?.message || String(e));
      }
    }

    // === LOGIN PAGE ===
    await page.goto('https://www.petz.com.br/checkout/login/indexLogado_Loja', {
      waitUntil: 'domcontentloaded',
    });

    console.log('⏳ [SERVICE] Aguardando renderização...');
    await sleep(3000);

    console.log('🔵 [SERVICE] Preenchendo email...');
    await setValueUnsafe(page, '#loginEmail', email);
    await sleep(600);

    console.log('🔵 [SERVICE] Preenchendo senha...');
    await setValueUnsafe(page, '#loginPassword', password);
    await sleep(800);

    console.log('🔵 [SERVICE] Clicando em ENTRAR...');
    await clickUnsafe(page, '[data-testid="ptz-button-entrar"]');

    // === AGUARDA RESULTADO ===
    const start = Date.now();
    let smsDetected = false;

    while (Date.now() - start < 30000) {
      const url = page.url();
      if (url === 'https://www.petz.com.br/' || url.startsWith('https://www.petz.com.br/?')) {
        console.log('✅ [SERVICE] Login sem SMS');
        const cookies = JSON.stringify(await page.context().cookies());
        return {
          status: 'success',
          cookies,
          close: async () => stagehand.close(),
        };
      }

      let hasSmsPopup = false;

      try {
        hasSmsPopup = await page.evaluate(() => {
          const title = document.querySelector('.wrapper .title');
          return !!(
            title &&
            title.textContent &&
            title.textContent.includes('Verificação de segurança')
          );
        });
      } catch (e) {
        // Se navegou bem na hora do evaluate, isso é "normal"
        const msg = String(e?.message || e);
        if (!msg.includes('Execution context was destroyed')) {
          throw e; // qualquer outro erro a gente quer ver
        }
        // navegação rolou: deixa o loop continuar e o url() vai atualizar
        hasSmsPopup = false;
      }

      if (hasSmsPopup) {
        smsDetected = true;
        break;
      }

      await sleep(500);
    }

    if (!smsDetected) {
      throw new Error('Nem logou nem apareceu SMS');
    }

    // === SMS FLOW ===
    console.log('📱 [SERVICE] SMS detectado');

    // seleciona radio SMS
    await page.evaluate(() => {
      const radio = document.querySelector('input[type="radio"][value="sms"]');
      radio?.click();
    });

    await sleep(800);

    // clicar continuar
    await clickUnsafe(page, '[data-testid="ptz-button-continuar"]');

    // aguarda input do código
    await page.waitForSelector('#code', { timeout: 30000 });

    console.log('⏳ [SERVICE] Aguardando código SMS...');
    return {
      status: 'awaiting_sms',
      sessionId,
      page,
      stagehand,
    };
  } catch (err) {
    if (stagehand) await stagehand.close();
    throw err;
  }
};

export const processSmsCode = async ({ page, code }) => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // ===== logs de browser + rede (pra entender loading infinito) =====
  const net = { requests: 0, finished: 0, failed: 0, last: [] };
  const push = (obj) => {
    net.last.push({ t: new Date().toISOString(), ...obj });
    if (net.last.length > 60) net.last.shift();
  };

  try {
    page.on('console', (msg) => push({ kind: 'console', type: msg.type(), text: msg.text() }));
    page.on('pageerror', (err) =>
      push({ kind: 'pageerror', message: err?.message || String(err) }),
    );
    page.on('request', (req) => {
      net.requests += 1;
      const url = req.url();
      // loga só coisas "interessantes"
      if (
        url.includes('validateAccessCode') ||
        url.includes('recaptcha') ||
        url.includes('/api/')
      ) {
        push({ kind: 'request', method: req.method(), url });
      }
    });
    page.on('requestfinished', (req) => {
      net.finished += 1;
      const url = req.url();
      if (url.includes('validateAccessCode') || url.includes('/api/')) {
        push({ kind: 'requestfinished', url });
      }
    });
    page.on('requestfailed', (req) => {
      net.failed += 1;
      const url = req.url();
      const failure = req.failure?.();
      push({ kind: 'requestfailed', url, errorText: failure?.errorText });
    });
    page.on('response', async (res) => {
      const url = res.url();
      if (url.includes('validateAccessCode') || url.includes('/api/')) {
        push({ kind: 'response', status: res.status(), url });
      }
    });
  } catch {
    // se não der pra registrar eventos, ok
  }

  const dumpEndDebug = async (tag) => {
    try {
      const url = page.url();
      const title = await page.title().catch(() => '');
      const cookieCount = await page
        .context()
        .cookies()
        .then((c) => c.length)
        .catch(() => -1);

      const dom = await page
        .evaluate(() => {
          const title = document.querySelector('.wrapper .title')?.textContent?.trim() || '';
          const codeVisible = !!document.querySelector('#code');
          const entrarDisabled =
            document.querySelector('[data-testid="ptz-button-entrar"]')?.hasAttribute('disabled') ??
            null;

          // texto “loading” mais comum
          const bodyText = (document.body?.innerText || '').toLowerCase();
          const hasLoadingWords =
            bodyText.includes('carregando') ||
            bodyText.includes('aguarde') ||
            bodyText.includes('processando');

          return { modalTitle: title, codeVisible, entrarDisabled, hasLoadingWords };
        })
        .catch(() => null);

      console.log(`🧾 [POS_SMS_DEBUG:${tag}] url=${url}`);
      console.log(`🧾 [POS_SMS_DEBUG:${tag}] title=${title}`);
      console.log(`🧾 [POS_SMS_DEBUG:${tag}] cookies=${cookieCount}`);
      console.log(`🧾 [POS_SMS_DEBUG:${tag}] dom=${JSON.stringify(dom)}`);
      console.log(`🧾 [POS_SMS_DEBUG:${tag}] net=${JSON.stringify(net)}`);
    } catch (e) {
      console.log('⚠️ [POS_SMS_DEBUG] falhou:', e?.message || String(e));
    }
  };

  console.log('📱 [SERVICE] Inserindo código SMS:', code);

  // 1) garantir que o input existe
  await page.waitForSelector('#code', { timeout: 30000 });

  // 2) preencher como no checkout (set value + dispatch)
  await page.evaluate((code) => {
    const input = document.querySelector('#code');
    if (!input) throw new Error('INPUT_CODE_NOT_FOUND');

    input.value = '';
    input.dispatchEvent(new Event('input', { bubbles: true }));

    input.value = String(code);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }, code);

  await sleep(700);

  // 3) garantir que botão entrou habilitou (às vezes precisa esperar)
  const waitEnabled = async (timeoutMs = 15000) => {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const state = await page.evaluate(() => {
        const btn = document.querySelector('[data-testid="ptz-button-entrar"]');
        if (!btn) return { exists: false };
        const disabled = btn.hasAttribute('disabled') || btn.disabled;
        return { exists: true, disabled };
      });
      if (state.exists && !state.disabled) return true;
      await sleep(250);
    }
    return false;
  };

  const enabled = await waitEnabled(15000);
  if (!enabled) {
    await dumpEndDebug('btn_not_enabled');
    throw new Error('SMS_BUTTON_NOT_ENABLED');
  }

  // 4) preparar 2 sinais fortes de “deu certo”
  // 4.1: resposta 200 em validateAccessCode (quando existir)
  const waitValidate200 = page
    .waitForResponse(
      (res) =>
        res.url().includes('/api/v3/public/client/validateAccessCode') && res.status() === 200,
      { timeout: 60000 },
    )
    .then(() => true)
    .catch(() => false);

  // 4.2: modal sumiu (code deixou de existir)
  const waitModalGone = (async () => {
    const start = Date.now();
    while (Date.now() - start < 60000) {
      const stillThere = await page
        .evaluate(() => !!document.querySelector('#code'))
        .catch(() => true);
      if (!stillThere) return true;
      await sleep(300);
    }
    return false;
  })();

  // 5) clicar em “Entrar” com 3 métodos (DOM click, dispatch, e clique no ptz-button wrapper)
  console.log('🔵 [SERVICE] Clicando em Entrar...');
  await page.evaluate(() => {
    const btn = document.querySelector('[data-testid="ptz-button-entrar"]');
    const wrapper =
      btn?.closest('ptz-button') ||
      document
        .querySelector('ptz-button button[data-testid="ptz-button-entrar"]')
        ?.closest('ptz-button');

    const clickEl = (el) => {
      if (!el) return false;
      try {
        el.click();
      } catch {}
      try {
        el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
        el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
        el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      } catch {}
      return true;
    };

    clickEl(btn);
    clickEl(wrapper); // às vezes handler tá no webcomponent
  });

  console.log(
    '🔵 [SERVICE] Aguardando sucesso (redirect / validate200 / modal sumir / cookies)...',
  );

  // 6) loop de sucesso: URL OU validate200 OU modal sumir OU cookies mudarem
  const start = Date.now();
  const timeoutMs = 90000;

  // snapshot cookies antes (pra detectar mudança)
  let beforeCookies = [];
  try {
    beforeCookies = await page.context().cookies();
  } catch {}

  const cookiesChanged = async () => {
    try {
      const after = await page.context().cookies();
      if (!beforeCookies?.length && after?.length) return true;

      // detecta mudança por nome/valor de cookie
      const toKey = (c) => `${c.name}=${c.value}`;
      const a = new Set((beforeCookies || []).map(toKey));
      const b = new Set((after || []).map(toKey));
      // se entrou qualquer cookie novo ou mudou valor
      for (const k of b) if (!a.has(k)) return true;
      return false;
    } catch {
      return false;
    }
  };

  // corre em paralelo, mas sem travar
  let validateOk = false;
  waitValidate200.then((v) => (validateOk = v)).catch(() => {});

  while (Date.now() - start < timeoutMs) {
    const url = page.url();

    if (url === 'https://www.petz.com.br/' || url.startsWith('https://www.petz.com.br/?')) {
      console.log('✅ [SERVICE] Redirect para home detectado');
      break;
    }

    if (validateOk) {
      console.log('✅ [SERVICE] validateAccessCode 200 detectado');
      break;
    }

    const modalGone = await page
      .evaluate(() => !document.querySelector('#code'))
      .catch(() => false);
    if (modalGone) {
      console.log('✅ [SERVICE] Modal sumiu (code não está mais no DOM)');
      break;
    }

    const changed = await cookiesChanged();
    if (changed) {
      console.log('✅ [SERVICE] Cookies mudaram (provável login ok mesmo com loading)');
      break;
    }

    await sleep(500);
  }

  // 7) extrair cookies mesmo se ficar em loading
  console.log('🔵 [SERVICE] Extraindo cookies...');
  let cookies = '';
  try {
    cookies = JSON.stringify(await page.context().cookies());
  } catch {}

  if (!cookies || cookies === '[]') {
    cookies = await page.evaluate(() => document.cookie).catch(() => '');
  }

  if (!cookies || String(cookies).trim() === '') {
    await dumpEndDebug('cookies_not_found_after_sms');
    throw new Error('COOKIES_NOT_FOUND_POS_SMS');
  }

  // se chegamos aqui, mesmo com loading, temos cookies
  // (aqui você decide se quer aceitar ou tratar como erro)
  console.log('✅ [SERVICE] Cookies obtidos (pós SMS)');
  return { cookies };
};

export default { runLoginFlow };
