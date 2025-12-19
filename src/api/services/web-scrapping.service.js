import 'dotenv/config';
import { Stagehand } from '@browserbasehq/stagehand';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const solveReCaptchaV2 = async (sitekey, url, apiKey) => {
  console.log(`🔓 [CAPSOLVER] Resolvendo reCAPTCHA v2 (sitekey: ${sitekey.substring(0, 20)}...)`);

  const baseUrl = 'https://api-stable.capsolver.com';

  try {
    // Criar tarefa
    const createResponse = await fetch(`${baseUrl}/createTask`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        clientKey: apiKey,
        task: {
          type: 'ReCaptchaV2TaskProxyLess',
          websiteURL: url,
          websiteKey: sitekey,
        },
      }),
    });

    const createData = await createResponse.json().catch(() => {
      throw new Error(`CapSolver API retornou erro HTTP ${createResponse.status}`);
    });

    if (createData.errorId !== 0) {
      throw new Error(`CapSolver: ${createData.errorDescription || createData.errorCode}`);
    }

    const taskId = createData.taskId;

    // Polling (máx 3 minutos)
    let attempts = 0;
    while (attempts < 60) {
      await sleep(3000);

      const resultResponse = await fetch(`${baseUrl}/getTaskResult`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientKey: apiKey,
          taskId: taskId,
        }),
      });

      const resultData = await resultResponse.json().catch(() => {
        throw new Error(`CapSolver API bloqueada por Cloudflare (Status ${resultResponse.status})`);
      });

      if (resultData.errorId !== 0) {
        throw new Error(`CapSolver: ${resultData.errorDescription || resultData.errorCode}`);
      }

      if (resultData.status === 'ready') {
        console.log(`✅ [CAPSOLVER] Resolvido em ${attempts * 3}s`);
        return resultData.solution.gRecaptchaResponse;
      }

      attempts++;
    }

    throw new Error('CAPSOLVER_TIMEOUT');
  } catch (err) {
    console.error('❌ [CAPSOLVER]', err.message);
    throw err;
  }
};

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

// Helper para logs
const log = (msg) => {
  console.log(msg);
  if (process.stderr?.write) {
    process.stderr.write(msg + '\n');
  }
};

const fillInputTyping = async (page, selector, value) => {
  log(`📝 [FILL] Preenchendo ${selector} (digitação progressiva)...`);
  log(`📝 [FILL] Aguardando ${selector} aparecer...`);
  await page.waitForSelector(selector, { timeout: 30000 });
  log(`✅ [FILL] ${selector} encontrado`);

  log(`📝 [FILL] Clicando em ${selector}...`);
  await page.locator(selector).click();
  log(`✅ [FILL] ${selector} clicado`);
  await sleep(300);

  log(`📝 [FILL] Limpando ${selector}...`);
  await page.locator(selector).fill('');
  await sleep(200);

  log(`📝 [FILL] Digitando em ${selector}...`);
  await page.locator(selector).type(value, { delay: 50 });
  log(`✅ [FILL] #email digitado com sucesso`);

  const finalValue = await page.locator(selector).inputValue();
  if (finalValue !== value) {
    throw new Error(`FILL_VALIDATION_FAILED: esperado="${value}" obtido="${finalValue}"`);
  }

  log(`✅ [FILL] ${selector} validado com sucesso`);
  await page.locator(selector).blur();
  await sleep(300);

  return true;
};

const clickUnsafe = async (page, selector) => {
  await page.evaluate((selector) => {
    const el = document.querySelector(selector);
    el?.click();
  }, selector);
};

const extractCookiesWithRetry = async (page, maxRetries = 3) => {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      log(`🍪 [COBASI] Tentativa ${attempt}/${maxRetries} de extrair cookies...`);

      const cookies = await page.context().cookies();
      log(`🍪 [COBASI] Cookies encontrados: ${cookies.length}`);

      if (!cookies || cookies.length === 0) {
        log(`⚠️ [COBASI] Nenhum cookie encontrado (tentativa ${attempt})`);
        if (attempt < maxRetries) {
          await sleep(1000);
          continue;
        }
        throw new Error('COBASI_COOKIES_NOT_FOUND');
      }

      const cookiesJson = JSON.stringify(cookies);
      log(`✅ [COBASI] Cookies serializados: ${cookiesJson.length} caracteres`);

      return cookiesJson;
    } catch (err) {
      log(`❌ [COBASI] Erro ao extrair cookies (tentativa ${attempt}): ${err.message}`);
      if (attempt < maxRetries) {
        await sleep(1000);
        continue;
      }
      throw err;
    }
  }
};

export const runLoginFlowCobasi = async ({ email, password, sessionId }) => {
  let stagehand;
  let page;

  try {
    const useCloud = process.env.USE_BROWSERBASE === 'true';
    log(`🔐 [COBASI] Iniciando login (${useCloud ? 'CLOUD' : 'LOCAL'})`);

    stagehand = new Stagehand({
      env: useCloud ? 'BROWSERBASE' : 'LOCAL',
      apiKey: process.env.BROWSERBASE_API_KEY,
      projectId: process.env.BROWSERBASE_PROJECT_ID,
      enableCaching: false,
      ...(useCloud
        ? {
            browserbaseSessionCreateParams: {
              keepAlive: true,
              timeout: 300,
            },
          }
        : {
            headless: false,
            domSettleTimeoutMs: 2000,
          }),
    });

    log('🔧 [COBASI] Inicializando Stagehand...');
    await stagehand.init({ modelName: 'claude-3-5-sonnet-20241022' });
    page = stagehand.page;
    log('✅ [COBASI] Stagehand inicializado');

    log('🌐 [COBASI] Navegando para login...');
    await page.goto('https://www.cobasi.com.br/login', { waitUntil: 'domcontentloaded' });
    log('✅ [COBASI] Página carregada');
    await sleep(3000);

    log('🍪 [COBASI] Aceitando cookies...');
    await page.evaluate(() => {
      const btn = document.querySelector('.cky-btn-accept');
      if (btn) btn.click();
    });
    log('✅ [COBASI] Cookies aceitos');
    await sleep(800);

    log('📝 [COBASI] Preenchendo email...');
    await fillInputTyping(page, '#email', email);
    await sleep(600);

    log('📝 [COBASI] Preenchendo senha...');
    await fillInputTyping(page, '#password', password);
    await sleep(800);

    log('⏳ [COBASI] Aguardando botão de login habilitar...');
    const waitForButtonEnabled = async (timeoutMs = 20000) => {
      const start = Date.now();
      while (Date.now() - start < timeoutMs) {
        const state = await page.evaluate(() => {
          const selectors = [
            '.btn.btn-lg.btn-turquoise.fullwidth',
            'button.btn-turquoise',
            'form button[type="submit"]',
          ];
          for (const selector of selectors) {
            const btn = document.querySelector(selector);
            if (btn) {
              const disabled =
                btn.classList.contains('disabled') || btn.hasAttribute('disabled') || btn.disabled;
              return { exists: true, disabled, selector };
            }
          }
          return { exists: false };
        });

        if (state.exists && !state.disabled) {
          return { enabled: true, selector: state.selector };
        }
        await sleep(250);
      }
      return { enabled: false };
    };

    const result = await waitForButtonEnabled(20000);
    if (!result.enabled) {
      throw new Error('COBASI_BUTTON_NOT_ENABLED');
    }
    log(`✅ [COBASI] Botão habilitado: ${result.selector}`);

    const beforeCookies = await page
      .context()
      .cookies()
      .catch(() => []);

    log('🔵 [COBASI] Clicando em ENTRAR...');
    await clickUnsafe(page, result.selector);
    log('✅ [COBASI] Clique executado');

    log('⏳ [COBASI] Aguardando possível captcha ou redirect (4s)...');
    await sleep(4000);

    const safeGetUrl = async () => {
      try {
        return page.url();
      } catch (err) {
        if (err.message.includes('Target closed') || err.message.includes('destroyed')) {
          return null;
        }
        throw err;
      }
    };

    const safeEvaluate = async (fn, ...args) => {
      try {
        return await page.evaluate(fn, ...args);
      } catch (err) {
        if (
          err.message.includes('Execution context was destroyed') ||
          err.message.includes('Target closed')
        ) {
          return { navigationDetected: true };
        }
        throw err;
      }
    };

    let currentUrl = await safeGetUrl();
    if (
      currentUrl &&
      (currentUrl === 'https://www.cobasi.com.br/' ||
        currentUrl.startsWith('https://www.cobasi.com.br/?'))
    ) {
      log('✅ [COBASI] Redirecionou direto (sem captcha) - login bem-sucedido');

      const cookies = await extractCookiesWithRetry(page);
      log('✅ [COBASI] Cookies obtidos com sucesso');

      return {
        status: 'success',
        cookies,
        close: async () => stagehand.close(),
      };
    }

    log('🔍 [COBASI] Detectando captcha...');
    const captchaInfo = await safeEvaluate(() => {
      const iframe = document.querySelector('iframe[src*="recaptcha"]');
      if (iframe) {
        const match = iframe.src.match(/k=([^&]+)/);
        return { detected: true, sitekey: match ? match[1] : null };
      }
      return { detected: false };
    });

    if (captchaInfo?.navigationDetected) {
      log('✅ [COBASI] Navegação detectada durante evaluate - login bem-sucedido');
      await sleep(1000);

      const cookies = await extractCookiesWithRetry(page);
      log('✅ [COBASI] Cookies obtidos com sucesso');

      return {
        status: 'success',
        cookies,
        close: async () => stagehand.close(),
      };
    }

    if (captchaInfo?.detected) {
      log('🤖 [COBASI] reCAPTCHA detectado - resolvendo...');

      // VERIFICAR SE JÁ REDIRECIONOU (captcha pode ter sumido)
      currentUrl = await safeGetUrl();
      if (
        currentUrl &&
        (currentUrl === 'https://www.cobasi.com.br/' ||
          currentUrl.startsWith('https://www.cobasi.com.br/?'))
      ) {
        log('✅ [COBASI] Já redirecionou (captcha sumiu) - login bem-sucedido');

        const cookies = await extractCookiesWithRetry(page);
        log('✅ [COBASI] Cookies obtidos com sucesso');

        return {
          status: 'success',
          cookies,
          close: async () => stagehand.close(),
        };
      }

      const apiKey = process.env.CAPSOLVER_API_KEY;
      if (!apiKey) {
        throw new Error('CAPSOLVER_API_KEY não configurada');
      }

      log('🔓 [COBASI] Resolvendo captcha (tentativa 1)...');

      // Resolver captcha EM PARALELO com verificação de redirect
      let captchaToken;
      let redirectDetected = false;

      const solvePromise = solveReCaptchaV2(
        captchaInfo.sitekey,
        'https://www.cobasi.com.br/login',
        apiKey,
      ).then((token) => {
        captchaToken = token;
        return token;
      });

      // Verificar redirect a cada 1s enquanto resolve captcha
      const checkRedirectInterval = setInterval(async () => {
        if (redirectDetected) return;

        const url = await safeGetUrl();
        if (
          url &&
          (url === 'https://www.cobasi.com.br/' || url.startsWith('https://www.cobasi.com.br/?'))
        ) {
          redirectDetected = true;
          log('✅ [COBASI] Redirecionou durante resolução de captcha - login bem-sucedido');
          clearInterval(checkRedirectInterval);
        }
      }, 1000);

      // Aguardar até que: (1) captcha resolva OU (2) redirect detectado
      while (!captchaToken && !redirectDetected) {
        await sleep(500);
      }

      clearInterval(checkRedirectInterval);

      // Se redirecionou durante a resolução, retorna cookies
      if (redirectDetected) {
        const cookies = await extractCookiesWithRetry(page);
        log('✅ [COBASI] Cookies obtidos com sucesso');

        return {
          status: 'success',
          cookies,
          close: async () => stagehand.close(),
        };
      }

      // Se chegou aqui, o captcha foi resolvido
      await solvePromise; // garante que terminou

      log('💉 [COBASI] Injetando token do captcha...');
      const injectResult = await safeEvaluate((token) => {
        if (window.___grecaptcha_cfg?.clients) {
          const clients = window.___grecaptcha_cfg.clients;
          for (const clientId in clients) {
            const client = clients[clientId];
            if (client?.callback) client.callback(token);
          }
        }
        const textarea = document.querySelector('#g-recaptcha-response');
        if (textarea) {
          textarea.value = token;
          textarea.innerHTML = token;
        }
        return { success: true };
      }, captchaToken);

      if (injectResult?.navigationDetected) {
        log('✅ [COBASI] Navegação detectada durante injeção - login bem-sucedido');
        await sleep(1000);

        const cookies = await extractCookiesWithRetry(page);
        log('✅ [COBASI] Cookies obtidos com sucesso');

        return {
          status: 'success',
          cookies,
          close: async () => stagehand.close(),
        };
      }

      log('🔍 [COBASI] Verificando se já redirecionou pós-injeção...');
      currentUrl = await safeGetUrl();
      if (
        currentUrl &&
        (currentUrl === 'https://www.cobasi.com.br/' ||
          currentUrl.startsWith('https://www.cobasi.com.br/?'))
      ) {
        log('✅ [COBASI] Redirecionou após injeção - login bem-sucedido');

        const cookies = await extractCookiesWithRetry(page);
        log('✅ [COBASI] Cookies obtidos com sucesso');

        return {
          status: 'success',
          cookies,
          close: async () => stagehand.close(),
        };
      }

      log('⏳ [COBASI] Aguardando processamento do captcha...');
      const waitStart = Date.now();
      while (Date.now() - waitStart < 5000) {
        await sleep(500);

        currentUrl = await safeGetUrl();
        if (
          currentUrl &&
          (currentUrl === 'https://www.cobasi.com.br/' ||
            currentUrl.startsWith('https://www.cobasi.com.br/?'))
        ) {
          log('✅ [COBASI] Redirecionou durante aguardo - login bem-sucedido');

          const cookies = await extractCookiesWithRetry(page);
          log('✅ [COBASI] Cookies obtidos com sucesso');

          return {
            status: 'success',
            cookies,
            close: async () => stagehand.close(),
          };
        }
      }
    } else {
      log('ℹ️ [COBASI] Nenhum captcha detectado');
    }

    // Loop de aguardar sucesso
    log('⏳ [COBASI] Aguardando sucesso do login...');
    const start = Date.now();
    let loginSuccess = false;

    const cookiesChanged = async () => {
      try {
        const after = await page.context().cookies();
        if (!beforeCookies.length && after.length) return true;

        const toKey = (c) => `${c.name}=${c.value}`;
        const before = new Set(beforeCookies.map(toKey));
        const afterSet = new Set(after.map(toKey));

        for (const k of afterSet) if (!before.has(k)) return true;
        return false;
      } catch {
        return false;
      }
    };

    while (Date.now() - start < 60000) {
      currentUrl = await safeGetUrl();

      if (!currentUrl) break;

      if (
        currentUrl === 'https://www.cobasi.com.br/' ||
        currentUrl.startsWith('https://www.cobasi.com.br/?')
      ) {
        log('✅ [COBASI] Login bem-sucedido (redirect)');
        loginSuccess = true;
        break;
      }

      if (await cookiesChanged()) {
        log('✅ [COBASI] Login bem-sucedido (cookies)');
        loginSuccess = true;
        break;
      }

      const errorCheck = await safeEvaluate(() => {
        const text = document.body.innerText.toLowerCase();
        return (
          text.includes('incorreto') ||
          text.includes('inválid') ||
          text.includes('erro ao fazer login')
        );
      });

      if (errorCheck?.navigationDetected) {
        log('✅ [COBASI] Navegação detectada - login bem-sucedido');
        loginSuccess = true;
        break;
      }

      if (errorCheck === true) {
        throw new Error('COBASI_INVALID_CREDENTIALS');
      }

      await sleep(500);
    }

    if (!loginSuccess) {
      throw new Error('COBASI_LOGIN_TIMEOUT');
    }

    const cookies = await extractCookiesWithRetry(page);
    log('✅ [COBASI] Cookies obtidos com sucesso');

    return {
      status: 'success',
      cookies,
      close: async () => stagehand.close(),
    };
  } catch (err) {
    log(`❌ [COBASI] ${err.message}`);
    if (stagehand) await stagehand.close();
    throw err;
  }
};

export default { runLoginFlow, runLoginFlowCobasi };
