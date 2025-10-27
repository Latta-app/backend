import fs from 'fs';

const SESSION_PATH = './session.json';

// Obtém o contexto interno (Stagehand usa Puppeteer por baixo)
async function getContext(page) {
  if (typeof page.context === 'function') return page.context();
  if (page._page && typeof page._page.context === 'function') return page._page.context();
  throw new Error('Não foi possível acessar o contexto do navegador.');
}

// 💾 Salva cookies e localStorage da sessão atual
export async function saveSession(page) {
  const context = await getContext(page);
  const cookies = await context.cookies();

  const localStorageData = await page.evaluate(() => {
    const data = {};
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key) data[key] = localStorage.getItem(key) || '';
    }
    return data;
  });

  fs.writeFileSync(
    SESSION_PATH,
    JSON.stringify({ cookies, localStorage: localStorageData }, null, 2),
  );

  console.log('💾 Sessão salva com sucesso.');
}

// 🔁 Restaura cookies e localStorage salvos anteriormente
export async function restoreSession(page) {
  if (!fs.existsSync(SESSION_PATH)) {
    console.log('⚠️ Nenhum arquivo de sessão encontrado.');
    return false;
  }

  console.log('🔁 Restaurando sessão Petz...');
  const context = await getContext(page);
  const session = JSON.parse(fs.readFileSync(SESSION_PATH, 'utf8'));

  // 🔹 Aplica cookies antes de abrir o site
  if (session.cookies?.length) {
    await context.addCookies(session.cookies);
  }

  // 🔹 Abre o site com cookies já aplicados
  await page.goto('https://www.petz.com.br', {
    waitUntil: 'domcontentloaded',
    timeout: 60000,
  });

  // 🔹 Aplica localStorage
  await page.evaluate((data) => {
    Object.entries(data).forEach(([k, v]) => localStorage.setItem(k, v));
  }, session.localStorage || {});

  console.log('✅ Sessão restaurada com sucesso.');
  return true;
}
