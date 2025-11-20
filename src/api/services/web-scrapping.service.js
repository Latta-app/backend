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
      // ⚠️ CRÍTICO: keepAlive mantém a sessão BrowserBase viva
      ...(useCloud && {
        browserbaseSessionCreateParams: {
          keepAlive: true,
        },
      }),
      // Configurações para modo local
      ...(!useCloud && {
        localBrowserLaunchOptions: {
          headless: false,
          args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu',
          ],
        },
      }),
    });

    console.log(`🚀 Stagehand iniciado em modo ${useCloud ? 'CLOUD' : 'LOCAL'}...`);
    await stagehand.init();
    page = stagehand.page;

    // === Sessão ===
    const hasSession = await restoreSession(page);
    if (!hasSession) {
      console.log('⚠️ Nenhuma sessão encontrada.');
      console.log('🌐 Abrindo página de login...');

      // Abre a página de login CORRETA
      await page.goto('https://www.petz.com.br/checkout/login/indexLogado_Loja', {
        waitUntil: 'domcontentloaded',
      });

      console.log('');
      console.log('═══════════════════════════════════════════════════');
      console.log('🧑‍💻 FAÇA LOGIN MANUALMENTE NO NAVEGADOR');
      console.log('   (Email + Senha + SMS se necessário)');
      console.log('');
      console.log('Quando terminar e voltar para https://www.petz.com.br/');
      console.log('com "Olá, Rafael" visível, crie o arquivo:');
      console.log('');
      console.log('   touch /tmp/petz-login-done');
      console.log('');
      console.log('═══════════════════════════════════════════════════');
      console.log('');
      console.log('⏳ Aguardando você fazer login...');

      // Aguarda arquivo de flag
      const flagFile = '/tmp/petz-login-done';
      if (fs.existsSync(flagFile)) fs.unlinkSync(flagFile);

      while (!fs.existsSync(flagFile)) {
        await page.waitForTimeout(1000);
      }

      console.log('✅ Flag detectada!');
      console.log('💾 Salvando sessão...');
      fs.unlinkSync(flagFile);
      await saveSession(page);
      console.log('✅ Sessão salva em session.json');
      console.log('');
      console.log('═══════════════════════════════════════════════════');
      console.log('⚠️ IMPORTANTE: Pare o servidor (Ctrl+C) e rode novamente');
      console.log('   para testar se está logado com a nova sessão');
      console.log('═══════════════════════════════════════════════════');

      await stagehand.close();
      return { pixCode: null, message: 'SESSION_CREATED' };
    }

    // === Verificar se sessão é válida ===
    console.log('🔍 Verificando validade da sessão...');
    await page.goto('https://www.petz.com.br', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);

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
      console.log('❌ Sessão expirada.');
      console.log('💡 Solução: Delete session.json e rode novamente para fazer novo login');
      await stagehand.close();
      return { pixCode: null, error: 'SESSION_EXPIRED' };
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
      const product = checkoutData.products[i];
      const link = product.url;
      const amount = product.amount || 1;
      const value = product.value || null;

      console.log(`🧩 Produto ${i + 1}/${checkoutData.products.length}:`);
      console.log(`   URL: ${link}`);
      console.log(`   Quantidade: ${amount}`);
      console.log(`   Valor/Tamanho: ${value || 'N/A'}`);

      await page.goto(link, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(2000);

      // === Seleção de tamanho/peso (value) ===
      if (value) {
        console.log(`📐 Selecionando variação: ${value}`);

        // Verifica se existe o popup de variações
        const hasVariationPopup = await page.evaluate(() => {
          return !!document.querySelector('#popupVariacoes');
        });

        if (hasVariationPopup) {
          // Abre o popup de variações
          await page.evaluate(() => {
            const button = document.querySelector('.size-select-button, .size-select-button-hidden');
            if (button) button.click();
          });

          await page.waitForTimeout(1000);

          // Seleciona a variação desejada
          const variationSelected = await page.evaluate((targetValue) => {
            const popup = document.querySelector('#popupVariacoes');
            if (!popup) return false;

            const items = Array.from(popup.querySelectorAll('.variacao-item'));
            const targetItem = items.find((item) => {
              const itemName = item.querySelector('.item-name');
              return itemName && itemName.textContent.trim() === targetValue;
            });

            if (targetItem) {
              targetItem.click();
              return true;
            }
            return false;
          }, value);

          if (variationSelected) {
            console.log(`✅ Variação "${value}" selecionada com sucesso`);
            await page.waitForTimeout(1500);
          } else {
            console.log(`⚠️ Variação "${value}" não encontrada`);
          }
        } else {
          console.log('⚠️ Produto não possui variações');
        }
      }

      await page.act("Click 'Adicionar à sacola' and wait for cart to open");
      await page.waitForTimeout(2000);
    }

    // === Navegando para o carrinho ===
    console.log('🛒 Indo para o carrinho...');
    await page.goto('https://www.petz.com.br/checkout/cart/', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);

    // === Limpa carrinho primeiro (será ajustado depois do CEP e cupom) ===
    console.log('🧹 Preparando carrinho...');

    // === CEP - LÓGICA CORRETA ===
    console.log(`📮 Configurando CEP ${checkoutData.address.cep}...`);

    // Verifica se campo CEP tem algo preenchido
    const cepState = await page.evaluate(() => {
      const input = document.querySelector('#cepSearch');
      if (!input) return { success: false, message: 'Campo CEP não encontrado' };

      const currentValue = input.value.trim();
      return {
        success: true,
        hasExistingCep: currentValue !== '',
        currentValue: currentValue,
      };
    });

    if (!cepState.success) {
      console.log('❌ Erro:', cepState.message);
      await stagehand.close();
      return { pixCode: null };
    }

    console.log(`🔍 CEP atual no campo: ${cepState.currentValue || '(vazio)'}`);

    // Se tem CEP preenchido, clica em "Alterar" primeiro
    if (cepState.hasExistingCep) {
      console.log('⚠️ Campo CEP preenchido. Clicando em "Alterar"...');
      await page.evaluate(() => {
        const alterarBtn = document.querySelector('[data-testid="ptz-bag-zip-code-apply"]');
        if (alterarBtn && alterarBtn.textContent.trim() === 'Alterar') {
          alterarBtn.click();
        }
      });
      console.log('⏳ Aguardando 1 segundo...');
      await page.waitForTimeout(1000);
    }

    // Digita o CEP
    console.log(`✏️ Digitando CEP ${checkoutData.address.cep}...`);
    await page.evaluate((cep) => {
      const input = document.querySelector('#cepSearch');
      if (input) {
        input.value = cep;
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }, checkoutData.address.cep);

    console.log('⏳ Aguardando 3 segundos...');
    await page.waitForTimeout(3000);

    // Clica em "Aplicar"
    console.log('🔘 Clicando em "Aplicar"...');
    await page.evaluate(() => {
      const aplicarBtn = document.querySelector('[data-testid="ptz-bag-zip-code-apply"]');
      if (aplicarBtn) {
        aplicarBtn.click();
      }
    });

    console.log('⏳ Aguardando processamento do CEP (3 segundos)...');
    await page.waitForTimeout(3000);

    console.log('⏳ Aguardando opções de entrega...');
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

    // === AGORA SIM: AJUSTE DE QUANTIDADES (DEPOIS DO CEP E CUPOM) ===
    console.log('🔢 Ajustando quantidades dos produtos no carrinho...');
    await page.waitForTimeout(2000);

    // Ajusta quantidade de cada produto digitando diretamente no input
    for (let i = 0; i < checkoutData.products.length; i++) {
      const product = checkoutData.products[i];
      const targetAmount = product.amount || 1;

      console.log(`📦 Produto ${i + 1}: ajustando para ${targetAmount} unidade(s)...`);

      // Verifica quantidade atual
      const currentQty = await page.evaluate(({ index }) => {
        const items = document.querySelectorAll('.cart-list-item');
        if (index >= items.length) return null;

        const item = items[index];
        const qtyInput = item.querySelector('input[data-testid="ptz-bag-product-quantity"]');
        return qtyInput ? parseInt(qtyInput.value || '1', 10) : null;
      }, { index: i });

      if (currentQty === null) {
        console.log('⚠️ Erro: Produto não encontrado no carrinho');
        continue;
      }

      if (currentQty === targetAmount) {
        console.log('✅ Quantidade já correta');
        continue;
      }

      console.log(`✏️ Alterando quantidade de ${currentQty} para ${targetAmount}...`);

      // Digita o valor diretamente no input e tira o foco
      await page.evaluate(
        ({ index, targetQty }) => {
          const items = document.querySelectorAll('.cart-list-item');
          if (index < items.length) {
            const item = items[index];
            const qtyInput = item.querySelector('input[data-testid="ptz-bag-product-quantity"]');
            if (qtyInput) {
              // Foca no input
              qtyInput.focus();
              // Seleciona todo o texto
              qtyInput.select();
              // Define o novo valor
              qtyInput.value = targetQty.toString();
              // Dispara eventos
              qtyInput.dispatchEvent(new Event('input', { bubbles: true }));
              qtyInput.dispatchEvent(new Event('change', { bubbles: true }));
              // Remove o foco do input (blur) para disparar a atualização
              qtyInput.blur();
            }
          }
        },
        { index: i, targetQty: targetAmount },
      );

      console.log('✅ Valor digitado e foco removido do input');

      // Aguarda o loading do carrinho processar
      console.log('⏳ Aguardando processamento do carrinho...');
      await page.waitForTimeout(4000);

      // Valida se a quantidade foi alterada
      const newQty = await page.evaluate(({ index }) => {
        const items = document.querySelectorAll('.cart-list-item');
        if (index >= items.length) return null;

        const item = items[index];
        const qtyInput = item.querySelector('input[data-testid="ptz-bag-product-quantity"]');
        return qtyInput ? parseInt(qtyInput.value || '1', 10) : null;
      }, { index: i });

      if (newQty === targetAmount) {
        console.log(`✅ Quantidade confirmada: ${newQty}`);
      } else {
        console.log(`⚠️ AVISO: Quantidade esperada ${targetAmount}, mas está ${newQty}`);
      }
    }

    console.log('✅ Todas as quantidades ajustadas!');
    await page.waitForTimeout(2000);

    // === VALIDAÇÃO FINAL DAS QUANTIDADES NO CARRINHO ===
    console.log('🔍 Verificação final das quantidades no carrinho...');
    const finalCartQuantities = await page.evaluate(() => {
      const items = document.querySelectorAll('.cart-list-item');
      return Array.from(items).map((item, index) => {
        const nameEl = item.querySelector('[data-testid="ptz-bag-product-description"] div');
        const qtyInput = item.querySelector('input[data-testid="ptz-bag-product-quantity"]');
        return {
          index: index + 1,
          name: nameEl?.textContent?.trim() || 'N/A',
          quantity: qtyInput ? parseInt(qtyInput.value || '1', 10) : null,
        };
      });
    });

    console.log('═══════════════════════════════════════════════════');
    console.log('🛒 QUANTIDADES FINAIS NO CARRINHO:');
    finalCartQuantities.forEach((item) => {
      console.log(`   ${item.index}. ${item.name}: ${item.quantity} unidade(s)`);
    });
    console.log('═══════════════════════════════════════════════════');

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
        const complementInput = document.querySelector(
          '[data-testid="ptz-bag-address-register-complement"]',
        );
        const referenceInput = document.querySelector(
          '[data-testid="ptz-bag-address-register-reference"]',
        );
        const aliasInput = document.querySelector(
          '[data-testid="ptz-bag-address-register-nickname"]',
        );

        // Número (obrigatório)
        if (numInput) {
          numInput.value = address.number || '';
          numInput.dispatchEvent(new Event('input', { bubbles: true }));
        }

        // Complemento (opcional)
        if (complementInput && address.complement) {
          complementInput.value = address.complement;
          complementInput.dispatchEvent(new Event('input', { bubbles: true }));
        }

        // Referência (opcional)
        if (referenceInput && address.reference) {
          referenceInput.value = address.reference;
          referenceInput.dispatchEvent(new Event('input', { bubbles: true }));
        }

        // Apelido do endereço
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

    // === VALIDAÇÃO DOS PRODUTOS ===
    console.log('🔍 Validando produtos na página de checkout...');
    const productsInfo = await page.evaluate(() => {
      const productContents = Array.from(document.querySelectorAll('.product-content'));

      const products = productContents.map((productEl) => {
        const nameEl = productEl.querySelector('[data-testid="ptz-checkout-product-name"]');
        const quantityEl = productEl.querySelector('.product-quantity p');
        const priceEl = productEl.querySelector('.product-price .price-unit');
        const totalEl = productEl.querySelector('.product-total strong');

        return {
          name: nameEl?.textContent?.trim() || 'N/A',
          quantity: quantityEl?.textContent?.trim() || 'N/A',
          unitPrice: priceEl?.textContent?.trim() || 'N/A',
          total: totalEl?.textContent?.trim() || 'N/A',
        };
      });

      return products;
    });

    console.log('═══════════════════════════════════════════════════');
    console.log('🛒 PRODUTOS NO CHECKOUT:');
    productsInfo.forEach((product, index) => {
      console.log(`\n   Produto ${index + 1}:`);
      console.log(`   Nome: ${product.name}`);
      console.log(`   Quantidade: ${product.quantity}`);
      console.log(`   Preço Unitário: ${product.unitPrice}`);
      console.log(`   Total: ${product.total}`);
    });
    console.log('═══════════════════════════════════════════════════');

    // === VALIDAÇÃO DO ENDEREÇO ===
    console.log('🔍 Validando endereço de entrega na página de checkout...');
    const addressInfo = await page.evaluate(() => {
      const addressContainer = document.querySelector('.delivery-address');
      if (!addressContainer) {
        return { found: false, error: 'Container de endereço não encontrado' };
      }

      const nameEl = addressContainer.querySelector('.delivery-address-name');
      const infoContainer = addressContainer.querySelector('.delivery-address-info');

      if (!infoContainer) {
        return { found: false, error: 'Informações de endereço não encontradas' };
      }

      const infoDivs = Array.from(infoContainer.querySelectorAll('div'));
      let street = '';
      let number = '';
      let neighborhood = '';
      let city = '';
      let state = '';

      // Primeira linha: Rua + Número
      if (infoDivs[0]) {
        const spans = infoDivs[0].querySelectorAll('span');
        if (spans.length >= 2) {
          street = spans[0]?.textContent?.trim() || '';
          number = spans[1]?.textContent?.trim() || '';
        }
      }

      // Segunda linha: Bairro - Cidade - Estado
      if (infoDivs[1]) {
        const spans = infoDivs[1].querySelectorAll('span');
        if (spans.length >= 3) {
          neighborhood = spans[0]?.textContent?.trim() || '';
          city = spans[1]?.textContent?.trim() || '';
          state = spans[2]?.textContent?.trim() || '';
        }
      }

      return {
        found: true,
        name: nameEl?.textContent?.trim() || 'N/A',
        street,
        number,
        neighborhood,
        city,
        state,
      };
    });

    if (!addressInfo.found) {
      console.log(`⚠️ Erro ao validar endereço: ${addressInfo.error}`);
    } else {
      console.log('═══════════════════════════════════════════════════');
      console.log('📍 ENDEREÇO DE ENTREGA DETECTADO:');
      console.log(`   Nome: ${addressInfo.name}`);
      console.log(`   Rua: ${addressInfo.street}`);
      console.log(`   Número: ${addressInfo.number}`);
      console.log(`   Bairro: ${addressInfo.neighborhood}`);
      console.log(`   Cidade: ${addressInfo.city}`);
      console.log(`   Estado: ${addressInfo.state}`);
      console.log('═══════════════════════════════════════════════════');
    }

    // === SELEÇÃO DE PIX OTIMIZADA ===
    console.log('💰 Selecionando pagamento PIX...');
    const pixClicked = await page.evaluate(() => {
      const pixBtn = document.querySelector('[data-testid="ptz-payment-method-pix"]');
      if (pixBtn) {
        pixBtn.click();
        return true;
      }
      return false;
    });

    if (!pixClicked) {
      console.log('⚠️ Não encontrou PIX pelo data-testid, tentando fallback...');
      await page.evaluate(() => {
        const pixElements = Array.from(
          document.querySelectorAll('.payment-method-item'),
        ).find((el) => el.textContent?.toLowerCase().includes('pix'));
        pixElements?.click();
      });
    }

    console.log('⏳ Aguardando confirmação da seleção do PIX...');
    await page.waitForTimeout(2000);

    // === BOTÃO PAGAR AGORA OTIMIZADO ===
    console.log('🪙 Clicando em "Pagar agora"...');
    const payButtonClicked = await page.evaluate(() => {
      const btnTestId = document.querySelector('[data-testid="ptz-checkout-pay-now"]');
      if (btnTestId) {
        btnTestId.click();
        return true;
      }

      const btn = Array.from(document.querySelectorAll('button, a')).find((el) =>
        el.textContent
          ?.trim()
          ?.toLowerCase()
          .includes('pagar agora'),
      );
      if (btn) {
        btn.click();
        return true;
      }
      return false;
    });

    if (!payButtonClicked) {
      console.log('⚠️ Não encontrou botão "Pagar agora"');
      await stagehand.close();
      return { pixCode: null };
    }

    console.log('Aguardando página de PIX carregar...');
    await page.waitForTimeout(8000);

    const pixCode = await page.evaluate(() => {
      const codeEl = document.querySelector('.PaymentMethod_pix-text__0hUPV');
      return codeEl?.textContent?.trim() || null;
    });

    if (pixCode) {
      console.log('✅ Código PIX obtido:', pixCode);

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
    return { pixCode, address: addressInfo, products: productsInfo, close };
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
