import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { Stagehand } from '@browserbasehq/stagehand';
import { restoreSession, saveSession } from '../../utils/sessionStore.js';

const PIX_FILE = path.resolve('tmp/pix-session.json');

const runCheckoutFlow = async (checkoutData) => {
  let stagehand = null;
  let page = null;

  try {
    const useCloud = process.env.USE_BROWSERBASE === 'true';
    stagehand = new Stagehand({
      env: useCloud ? 'BROWSERBASE' : 'LOCAL',
      apiKey: process.env.BROWSERBASE_API_KEY,
      projectId: process.env.BROWSERBASE_PROJECT_ID,
      modelName: process.env.MODEL_NAME ?? 'claude-3-7-sonnet-latest',
      modelClientOptions: { apiKey: process.env.ANTHROPIC_API_KEY },
      enableCaching: false,
      localBrowserLaunchOptions: {
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu',
        ],
      },
    });

    console.log(`🚀 Stagehand iniciado em modo ${useCloud ? 'CLOUD' : 'LOCAL'}...`);
    await stagehand.init();
    page = stagehand.page;

    // === Sessão ===
    const hasSession = await restoreSession(page);
    if (!hasSession) {
      console.log('⚠️ Nenhuma sessão encontrada. Faça login manual...');
      await page.goto('https://www.petz.com.br/entrar', { waitUntil: 'domcontentloaded' });
      console.log('🧑‍💻 Faça login e pressione ENTER quando terminar.');
      await new Promise((resolve) => {
        process.stdin.resume();
        process.stdin.on('data', () => resolve());
      });
      await saveSession(page);
      await stagehand.close();
      return { pixCode: null };
    }

    // === Login válido ===
    await page.goto('https://www.petz.com.br', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500);
    const logged = await page.evaluate(() => {
      const hasUser = !!document.querySelector(
        '.header-user, .header__user-name, [data-testid="user-name"]',
      );
      const possibleButtons = Array.from(document.querySelectorAll('a, button'));
      const hasLoginButton = possibleButtons.some((el) =>
        el.textContent
          ?.trim()
          .toLowerCase()
          .includes('entrar'),
      );
      return hasUser || !hasLoginButton;
    });
    if (!logged) {
      console.log('⚠️ Sessão expirada. Faça login novamente.');
      await page.goto('https://www.petz.com.br/entrar');
      await new Promise((resolve) => {
        process.stdin.resume();
        process.stdin.on('data', () => resolve());
      });
      await saveSession(page);
      await stagehand.close();
      return { pixCode: null };
    }

    console.log('✅ Sessão válida. Limpando carrinho...');
    await page.goto('https://www.petz.com.br/checkout/cart/', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);

    const carrinhoLimpo = await page.evaluate(() => {
      const limparBtn = Array.from(document.querySelectorAll('button, a')).find((el) =>
        el.textContent
          ?.trim()
          .toLowerCase()
          .includes('limpar sacola'),
      );
      if (limparBtn) {
        limparBtn.click();
        return false;
      }
      return true;
    });

    if (!carrinhoLimpo) {
      console.log('🧹 Limpando sacola...');
      await page.waitForTimeout(1500);
      await page.evaluate(() => {
        const excluirBtn = Array.from(document.querySelectorAll('button, a')).find((el) =>
          el.textContent
            ?.trim()
            .toLowerCase()
            .includes('excluir'),
        );
        excluirBtn?.click();
      });
      await page.waitForTimeout(4000);
    }

    // === Adiciona produtos ===
    for (let i = 0; i < checkoutData.products.length; i++) {
      const link = checkoutData.products[i];
      console.log(`🧩 Produto ${i + 1}/${checkoutData.products.length}: ${link}`);
      await page.goto(link, { waitUntil: 'domcontentloaded' });
      await page.act("Click 'Adicionar à sacola' and wait for cart to open");
      await page.waitForTimeout(2000);
    }

    // === CEP ===
    console.log(`📮 Configurando CEP ${checkoutData.address.cep}...`);
    await page.goto('https://www.petz.com.br/checkout/cart/', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.cep-search', { timeout: 15000 });

    const cepState = await page.evaluate((cep) => {
      const input = document.querySelector('#cepSearch');
      if (!input) return { success: false, message: 'Campo CEP não encontrado' };

      const currentValue = input.value.trim();
      const hasExistingCep = currentValue !== '';

      if (hasExistingCep) {
        const alterarBtn = document.querySelector('[data-testid="ptz-bag-zip-code-apply"]');
        if (alterarBtn && alterarBtn.textContent.trim() === 'Alterar') {
          alterarBtn.click();
          return { success: true, needsWait: true, message: 'Clicou em Alterar' };
        }
      }
      return { success: true, needsWait: false, message: 'Campo CEP vazio' };
    }, checkoutData.address.cep);

    if (!cepState.success) {
      console.log('❌ Erro:', cepState.message);
      await stagehand.close();
      return { pixCode: null };
    }

    if (cepState.needsWait) {
      console.log('Aguardando após clicar em Alterar...');
      await page.waitForTimeout(2000);
    }

    console.log('Aguardando processamento do CEP...');
    await page.waitForTimeout(3000);

    console.log('Aguardando opções de entrega...');
    await page.waitForSelector('.btnCardSelect', { timeout: 15000 });
    await page.waitForTimeout(2000);

    const entregaSelecionada = await page.evaluate(() => {
      const options = Array.from(document.querySelectorAll('.btnCardSelect'));
      const standard = options.find((el) => el.textContent?.toLowerCase().includes('padrão'));
      if (standard) {
        standard.click();
        return true;
      }
      return false;
    });

    if (!entregaSelecionada) {
      console.log('⚠️ Não foi possível selecionar o tipo de entrega');
      await stagehand.close();
      return { pixCode: null };
    }

    console.log('✅ Tipo de entrega selecionado, aguardando processamento...');
    await page.waitForTimeout(3000);

    // === Cupom ===
    if (checkoutData.cupom) {
      console.log(`🎟️ Aplicando cupom ${checkoutData.cupom}...`);
      await page.evaluate((cupom) => {
        const input = document.querySelector('#applyCouponCart');
        if (input) {
          input.value = cupom;
          input.dispatchEvent(new Event('input', { bubbles: true }));
          const apply = input.closest('form')?.querySelector("[type='submit'], .apply-coupon");
          apply?.click();
        }
      }, checkoutData.cupom);

      console.log('Aguardando processamento do cupom...');
      await page.waitForTimeout(5000);

      const cupomApplied = await page.evaluate(() => {
        const texto = document.body.textContent.toLowerCase();
        return texto.includes('desconto') || texto.includes('cupom');
      });

      if (cupomApplied) console.log('✅ Cupom aplicado com sucesso!');
      else console.log('⚠️ Cupom pode não ter sido aplicado corretamente.');
    }

    // === Validar antes de checkout ===
    console.log('🔍 Validando antes de prosseguir...');
    const canProceed = await page.evaluate(() => {
      const zip = document.querySelector('#cepSearch')?.value?.trim();
      const deliverySelected = document.querySelector(
        '.btnCardSelect.selected, .btnCardSelect.active',
      );
      return !!zip && !!deliverySelected;
    });

    if (!canProceed) {
      console.log('⚠️ Falha na validação antes de prosseguir para pagamento.');
      await stagehand.close();
      return { pixCode: null };
    }

    console.log('✅ Todos os campos estão preenchidos. Indo para pagamento...');
    await page.evaluate(() => {
      const btn = document.querySelector(
        '#cartButtonConfirm, [data-testid="ptz-bag-button-go-to-payment"]',
      );
      btn?.click();
    });

    // 🧩 Trata o caso do popup de endereço
    console.log('⏳ Verificando se apareceu o pop-up de endereço...');
    await page.waitForTimeout(3000);
    const hasAddressPopup = await page.evaluate(() => {
      const title = Array.from(document.querySelectorAll('.title')).find((el) =>
        el.textContent
          ?.trim()
          .toLowerCase()
          .includes('cadastrar endereço'),
      );
      return !!title;
    });

    if (hasAddressPopup) {
      console.log('📦 Popup "Cadastrar endereço" detectado! Clicando em "Cadastrar"...');
      await page.evaluate(() => {
        const cadastrarBtn = Array.from(document.querySelectorAll('button')).find((el) =>
          el.textContent
            ?.trim()
            .toLowerCase()
            .includes('cadastrar'),
        );
        cadastrarBtn?.click();
      });

      await page.waitForTimeout(2000);

      // Segundo modal (formulário de endereço)
      console.log('🏠 Preenchendo novo endereço...');
      await page.waitForSelector('[data-testid="ptz-bag-address-register-number"]', {
        timeout: 10000,
      });

      await page.evaluate((address) => {
        const numInput = document.querySelector('[data-testid="ptz-bag-address-register-number"]');
        const aliasInput = document.querySelector(
          '[data-testid="ptz-bag-address-register-nickname"]',
        );
        if (numInput) {
          numInput.value = address.number || '';
          numInput.dispatchEvent(new Event('input', { bubbles: true }));
        }
        if (aliasInput) {
          aliasInput.value = address.alias || '';
          aliasInput.dispatchEvent(new Event('input', { bubbles: true }));
        }
        const saveBtn = document.querySelector('[data-testid="ptz-bag-address-register-save"]');
        saveBtn?.click();
      }, checkoutData.address);

      console.log('💾 Endereço cadastrado, aguardando confirmação...');
      await page.waitForTimeout(5000);
    } else {
      console.log('✅ Nenhum popup de endereço encontrado, seguindo normalmente...');
    }

    // === Página de pagamento ===
    console.log('💳 Aguardando página de pagamento...');
    try {
      await page.waitForSelector('[data-testid="ptz-checkout-title"]', { timeout: 15000 });
      console.log('✅ Página de pagamento detectada com sucesso!');
    } catch (e) {
      console.log('⚠️ Não foi possível detectar a página de pagamento.');
      console.log('🔍 Tentando capturar o título atual da página...');
      const currentTitle = await page.title();
      console.log(`Título atual: "${currentTitle}"`);
      await stagehand.close();
      return { pixCode: null };
    }

    console.log('💰 Selecionando pagamento PIX...');
    await page.act("Select 'Pix' payment method on payment page");
    await page.waitForTimeout(2500);

    console.log('🪙 Clicando em "Pagar agora"...');
    await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll('button, a')).find((el) =>
        el.textContent
          ?.trim()
          ?.toLowerCase()
          .includes('pagar agora'),
      );
      btn?.click();
    });

    console.log('Aguardando página de PIX carregar...');
    await page.waitForTimeout(8000);

    const pixCode = await page.evaluate(() => {
      const codeEl = document.querySelector('.PaymentMethod_pix-text__0hUPV');
      return codeEl?.textContent?.trim() || null;
    });

    if (pixCode) {
      console.log('✅ Código PIX obtido:', pixCode);

      // 💾 Salva o PIX no arquivo temporário
      try {
        fs.mkdirSync(path.dirname(PIX_FILE), { recursive: true });
        fs.writeFileSync(
          PIX_FILE,
          JSON.stringify({ pix: pixCode, ts: Date.now() }, null, 2),
          'utf8',
        );
        console.log('💾 [service] PIX salvo em', PIX_FILE);
      } catch (err) {
        console.error('Erro ao salvar PIX em arquivo:', err);
      }
    } else {
      console.log('⚠️ Não foi possível encontrar o código PIX');
    }

    await saveSession(page);

    // Retorna imediatamente (não bloqueia o event loop)
    const close = async () => {
      try {
        console.log('🔒 [runCheckoutFlow] Fechando Stagehand manualmente...');
        await stagehand.close();
        console.log('✅ [runCheckoutFlow] Stagehand fechado com sucesso.');
      } catch (err) {
        console.error('Erro ao fechar Stagehand:', err);
      }
    };

    console.log('🚀 [runCheckoutFlow] Finalizando e retornando PIX...');
    return { pixCode, close };
  } catch (error) {
    console.error('❌ Erro durante o processo de checkout:', error);
    if (stagehand) {
      try {
        await stagehand.close();
      } catch (closeError) {
        console.error('Erro ao fechar navegador após falha:', closeError);
      }
    }
    throw error;
  }
};

export default { runCheckoutFlow };
