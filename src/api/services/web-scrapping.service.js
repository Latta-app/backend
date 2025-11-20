import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { Stagehand } from '@browserbasehq/stagehand';
import { restoreSession, saveSession } from '../../utils/sessionStore.js';

const PIX_FILE = path.resolve('tmp/pix-session.json');

// Helper para logar tempo decorrido
const logTime = (startTime, label) => {
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`⏱️ [${elapsed}s] ${label}`);
};

const runCheckoutFlow = async (checkoutData) => {
  let stagehand = null;
  let page = null;
  const startTime = Date.now(); // Rastrear tempo total

  try {
    console.log('🔵 [SERVICE] Iniciando runCheckoutFlow...');
    console.log('🔵 [SERVICE] Dados recebidos:', JSON.stringify(checkoutData, null, 2));

    const useCloud = process.env.USE_BROWSERBASE === 'true';
    console.log(`🔵 [SERVICE] Modo: ${useCloud ? 'BROWSERBASE (CLOUD)' : 'LOCAL'}`);

    console.log('🔵 [SERVICE] Criando instância Stagehand...');
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
          timeout: 600, // 10 minutos de timeout
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
    console.log('🔵 [SERVICE] Chamando stagehand.init()...');
    await stagehand.init();
    console.log('✅ [SERVICE] stagehand.init() concluído');
    page = stagehand.page;
    console.log('✅ [SERVICE] Página obtida:', page ? 'OK' : 'NULL');

    // === Sessão ===
    console.log('🔵 [SERVICE] Verificando sessão existente...');
    const hasSession = await restoreSession(page);
    console.log(`🔵 [SERVICE] Sessão encontrada: ${hasSession ? 'SIM' : 'NÃO'}`);

    if (!hasSession) {
      console.log('⚠️ Nenhuma sessão encontrada.');
      console.log('🌐 Abrindo página de login...');

      // Abre a página de login CORRETA
      console.log('🔵 [SERVICE] Navegando para página de login...');
      await page.goto('https://www.petz.com.br/checkout/login/indexLogado_Loja', {
        waitUntil: 'domcontentloaded',
      });
      console.log('✅ [SERVICE] Página de login carregada');

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
    console.log('🔵 [SERVICE] Verificando validade da sessão...');
    console.log('🔵 [SERVICE] Navegando para home da Petz...');
    await page.goto('https://www.petz.com.br', { waitUntil: 'domcontentloaded' });
    console.log('✅ [SERVICE] Home carregada, aguardando 2s...');
    await page.waitForTimeout(2000);

    console.log('🔵 [SERVICE] Avaliando se está logado...');
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
    console.log(`🔵 [SERVICE] Status de login: ${logged ? 'LOGADO' : 'NÃO LOGADO'}`);

    if (!logged) {
      console.log('❌ [SERVICE] Sessão expirada.');
      console.log('💡 Solução: Delete session.json e rode novamente para fazer novo login');
      await stagehand.close();
      return { pixCode: null, error: 'SESSION_EXPIRED' };
    }

    console.log('✅ [SERVICE] Sessão válida. Limpando carrinho...');
    console.log('🔵 [SERVICE] Navegando para carrinho...');
    await page.goto('https://www.petz.com.br/checkout/cart/', { waitUntil: 'domcontentloaded' });
    console.log('✅ [SERVICE] Página do carrinho carregada');

    console.log('🔵 [SERVICE] Aguardando 3s antes de verificar carrinho...');
    await page.waitForTimeout(3000);

    console.log('🔵 [SERVICE] Verificando se há botão "Limpar sacola"...');
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
    console.log(`🔵 [SERVICE] Carrinho limpo: ${carrinhoLimpo ? 'JÁ VAZIO' : 'LIMPANDO'}`);

    if (!carrinhoLimpo) {
      console.log('🧹 [SERVICE] Limpando sacola...');
      await page.waitForTimeout(1500);
      console.log('🔵 [SERVICE] Confirmando exclusão...');
      await page.evaluate(() => {
        const excluirBtn = Array.from(document.querySelectorAll('button, a')).find((el) =>
          el.textContent
            ?.trim()
            .toLowerCase()
            .includes('excluir'),
        );
        excluirBtn?.click();
      });
      console.log('🔵 [SERVICE] Aguardando 4s após limpar carrinho...');
      await page.waitForTimeout(4000);
      console.log('✅ [SERVICE] Carrinho limpo com sucesso');
    }

    // === Adiciona produtos ===
    console.log(`🔵 [SERVICE] Iniciando adição de ${checkoutData.products.length} produto(s)...`);
    for (let i = 0; i < checkoutData.products.length; i++) {
      const product = checkoutData.products[i];
      const link = product.url;
      const amount = product.amount || 1;
      const value = product.value || null;

      console.log('═══════════════════════════════════════════════════');
      console.log(`🔵 [SERVICE] Produto ${i + 1}/${checkoutData.products.length}:`);
      console.log(`   URL: ${link}`);
      console.log(`   Quantidade: ${amount}`);
      console.log(`   Valor/Tamanho: ${value || 'N/A'}`);

      console.log(`🔵 [SERVICE] Navegando para produto ${i + 1}...`);
      await page.goto(link, { waitUntil: 'domcontentloaded' });
      console.log(`✅ [SERVICE] Página do produto ${i + 1} carregada`);
      console.log('🔵 [SERVICE] Aguardando 2s...');
      await page.waitForTimeout(2000);

      // === Seleção de tamanho/peso (value) ===
      if (value) {
        console.log(`📐 [SERVICE] Produto tem variação: ${value}`);

        // Verifica se existe o popup de variações
        console.log('🔵 [SERVICE] Verificando popup de variações...');
        const hasVariationPopup = await page.evaluate(() => {
          return !!document.querySelector('#popupVariacoes');
        });
        console.log(`🔵 [SERVICE] Popup de variações existe: ${hasVariationPopup ? 'SIM' : 'NÃO'}`);

        if (hasVariationPopup) {
          // Abre o popup de variações
          console.log('🔵 [SERVICE] Abrindo popup de variações...');
          await page.evaluate(() => {
            const button = document.querySelector('.size-select-button, .size-select-button-hidden');
            if (button) button.click();
          });

          console.log('🔵 [SERVICE] Aguardando 1s após abrir popup...');
          await page.waitForTimeout(1000);

          // Seleciona a variação desejada
          console.log(`🔵 [SERVICE] Procurando variação "${value}"...`);
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
            console.log(`✅ [SERVICE] Variação "${value}" selecionada com sucesso`);
            // Aguardar botão atualizar após selecionar variação
            await page.waitForTimeout(useCloud ? 2000 : 1500);
          } else {
            console.log(`⚠️ [SERVICE] Variação "${value}" não encontrada`);
          }
        } else {
          console.log('⚠️ [SERVICE] Produto não possui variações');
        }
      } else {
        // Sem variação, aguardar um pouco para garantir que o botão está pronto
        await page.waitForTimeout(500);
      }

      // Clica em "Adicionar à sacola" usando #addToBag (web component)
      console.log('🔵 [SERVICE] Procurando botão "Adicionar à sacola"...');

      // Scroll para o botão estar visível (sem delay)
      console.log('🔵 [SERVICE] Fazendo scroll para o botão...');
      await page.evaluate(() => {
        const addButton = document.querySelector('#addToBag');
        if (addButton) {
          addButton.scrollIntoView({ behavior: 'auto', block: 'center' }); // auto = instant
        }
      });

      console.log('🔵 [SERVICE] Clicando no botão #addToBag...');
      let clickSuccess = false;

      // Método 1: Clicar no web component (#addToBag) - FUNCIONA SEMPRE
      try {
        const ptzButton = await page.$('#addToBag');
        if (ptzButton) {
          await ptzButton.click();
          console.log(`✅ [SERVICE] Botão clicado usando #addToBag`);
          clickSuccess = true;
        }
      } catch (err) {
        console.log('⚠️ [SERVICE] Falha ao clicar com #addToBag:', err.message);
      }

      // Método 2: Executar a função comprarAgora() diretamente (fallback)
      if (!clickSuccess) {
        console.log('🔵 [SERVICE] Tentando executar comprarAgora() diretamente...');
        const executed = await page.evaluate(() => {
          const ptzButton = document.querySelector('#addToBag');
          if (ptzButton && typeof window.comprarAgora === 'function') {
            window.comprarAgora(ptzButton);
            return true;
          }
          return false;
        });

        if (executed) {
          console.log(`✅ [SERVICE] Função comprarAgora() executada`);
          clickSuccess = true;
        }
      }

      // Método 3: Clicar com dispatchEvent (último fallback)
      if (!clickSuccess) {
        console.log('🔵 [SERVICE] Tentando clicar com dispatchEvent...');
        const clicked = await page.evaluate(() => {
          const ptzButton = document.querySelector('#addToBag');
          if (ptzButton) {
            ptzButton.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
            ptzButton.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
            ptzButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
            ptzButton.click();
            return true;
          }
          return false;
        });

        if (clicked) {
          console.log(`✅ [SERVICE] Botão clicado com dispatchEvent`);
          clickSuccess = true;
        }
      }

      if (!clickSuccess) {
        console.log('❌ [SERVICE] Falha ao clicar no botão após todas as tentativas');
        continue;
      }

      // CRÍTICO: Aguardar o redirecionamento automático para o carrinho
      console.log('🔵 [SERVICE] Aguardando redirecionamento automático para o carrinho...');
      try {
        await page.waitForURL('**/checkout/cart/**', { timeout: 15000 });
        console.log(`✅ [SERVICE] Redirecionado para o carrinho após adicionar produto ${i + 1}`);
      } catch (err) {
        console.log('⚠️ [SERVICE] Timeout aguardando redirecionamento, verificando URL atual...');
        const currentUrl = page.url();
        console.log('🔍 [SERVICE] URL atual:', currentUrl);

        if (!currentUrl.includes('/checkout/cart/')) {
          console.log('⚠️ [SERVICE] Não redirecionou para o carrinho, aguardando mais 3s...');
          await page.waitForTimeout(3000);
        }
      }

      // Aguardar o carrinho carregar se foi redirecionado (reduzido)
      console.log('🔵 [SERVICE] Aguardando carrinho carregar após adicionar produto...');
      await page.waitForTimeout(useCloud ? 2000 : 1000);

      // Verificar se produto foi adicionado
      const itemsInCart = await page.evaluate(() => {
        const items = document.querySelectorAll('.cart-list-item');
        return items.length;
      });
      console.log(`🔵 [SERVICE] Itens no carrinho após adicionar produto ${i + 1}: ${itemsInCart}`);

      console.log('═══════════════════════════════════════════════════');
    }

    console.log(`✅ [SERVICE] Todos os ${checkoutData.products.length} produtos adicionados!`);

    // === Verificando se já está no carrinho ou navegando ===
    const currentUrl = page.url();
    console.log('🔵 [SERVICE] URL atual:', currentUrl);

    if (!currentUrl.includes('/checkout/cart/')) {
      console.log('🔵 [SERVICE] Não está no carrinho, navegando...');
      await page.goto('https://www.petz.com.br/checkout/cart/', { waitUntil: 'domcontentloaded' });
      console.log('✅ [SERVICE] Página do carrinho carregada');
    } else {
      console.log('✅ [SERVICE] Já está no carrinho (redirecionado automaticamente)');
    }

    // Aguarda tempo para garantir que JS carregou (reduzido)
    const waitTimeForCart = useCloud ? 3000 : 2000;
    console.log(`🔵 [SERVICE] Aguardando ${waitTimeForCart}ms para página carregar completamente...`);
    await page.waitForTimeout(waitTimeForCart);

    logTime(startTime, 'Carrinho carregado');

    // Verificar quantos itens estão no carrinho antes de continuar
    console.log('🔵 [SERVICE] Verificando produtos no carrinho...');
    const finalItemCount = await page.evaluate(() => {
      const items = document.querySelectorAll('.cart-list-item');
      return items.length;
    });
    console.log(`🔵 [SERVICE] Total de itens no carrinho: ${finalItemCount}`);

    if (finalItemCount === 0) {
      console.log('❌ [SERVICE] ERRO: Carrinho vazio! Produtos não foram adicionados corretamente.');
      console.log('🔍 [SERVICE] Possíveis causas:');
      console.log('   1. Redirecionamento foi muito rápido e perdemos os produtos');
      console.log('   2. Produtos não estão disponíveis');
      console.log('   3. Sessão expirou durante a adição');
    } else if (finalItemCount !== checkoutData.products.length) {
      console.log(`⚠️ [SERVICE] AVISO: Esperado ${checkoutData.products.length} itens, mas há ${finalItemCount} no carrinho`);
    } else {
      console.log(`✅ [SERVICE] Todos os ${finalItemCount} produtos estão no carrinho!`);
    }

    // Aguarda o campo CEP estar disponível (importante para modo CLOUD)
    const cepTimeout = useCloud ? 30000 : 15000;
    console.log(`🔵 [SERVICE] Aguardando campo CEP carregar (timeout ${cepTimeout}ms)...`);
    try {
      await page.waitForSelector('#cepSearch', { timeout: cepTimeout });
      console.log('✅ [SERVICE] Campo CEP encontrado');
    } catch (err) {
      console.log('❌ [SERVICE] Timeout aguardando campo CEP');
      console.log('❌ [SERVICE] Erro:', err.message);

      // Debug: captura URL atual e verifica se está na página certa
      const currentUrl = page.url();
      console.log('🔍 [SERVICE] URL atual:', currentUrl);

      // Tenta verificar se há algum erro na página
      const pageContent = await page.evaluate(() => {
        return {
          title: document.title,
          hasCartItems: !!document.querySelector('.cart-list-item'),
          hasCepSection: !!document.querySelector('.cart-shipping, .shipping-section'),
        };
      });
      console.log('🔍 [SERVICE] Estado da página:', JSON.stringify(pageContent));
    }

    console.log('🔵 [SERVICE] Aguardando 2s antes de processar CEP...');
    await page.waitForTimeout(2000);

    // === Limpa carrinho primeiro (será ajustado depois do CEP e cupom) ===
    console.log('🔵 [SERVICE] Preparando carrinho...');

    // === CEP - LÓGICA CORRETA ===
    console.log(`🔵 [SERVICE] Configurando CEP ${checkoutData.address.cep}...`);

    // Verifica se campo CEP existe com retry
    console.log('🔵 [SERVICE] Verificando existência do campo CEP...');
    let cepFieldExists = false;
    let retryCount = 0;
    const maxRetries = useCloud ? 3 : 1;

    while (!cepFieldExists && retryCount < maxRetries) {
      if (retryCount > 0) {
        console.log(`🔵 [SERVICE] Tentativa ${retryCount + 1}/${maxRetries} de encontrar campo CEP...`);
        await page.waitForTimeout(5000);
      }

      cepFieldExists = await page.evaluate(() => {
        return !!document.querySelector('#cepSearch');
      });

      if (!cepFieldExists) {
        console.log(`⚠️ [SERVICE] Campo CEP não encontrado na tentativa ${retryCount + 1}`);
        retryCount++;
      }
    }

    if (!cepFieldExists) {
      console.log('❌ [SERVICE] Campo CEP não encontrado após todas as tentativas');
      const currentUrl = page.url();
      console.log('🔍 [SERVICE] URL atual:', currentUrl);

      // Tenta recarregar a página do carrinho uma última vez
      console.log('🔄 [SERVICE] Tentando recarregar página do carrinho...');
      await page.goto('https://www.petz.com.br/checkout/cart/', { waitUntil: 'networkidle' });
      await page.waitForTimeout(5000);

      const cepExistsAfterReload = await page.evaluate(() => {
        return !!document.querySelector('#cepSearch');
      });

      if (!cepExistsAfterReload) {
        console.log('❌ [SERVICE] Campo CEP não encontrado mesmo após reload');
        await stagehand.close();
        return { pixCode: null };
      }
      console.log('✅ [SERVICE] Campo CEP encontrado após reload');
    } else {
      console.log('✅ [SERVICE] Campo CEP encontrado');
    }

    // Verifica se campo CEP tem algo preenchido
    console.log('🔵 [SERVICE] Verificando estado do campo CEP...');
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
      console.log('❌ [SERVICE] Erro:', cepState.message);
      await stagehand.close();
      return { pixCode: null };
    }

    console.log(`🔵 [SERVICE] CEP atual no campo: ${cepState.currentValue || '(vazio)'}`);

    // Se tem CEP preenchido, clica em "Alterar" primeiro
    if (cepState.hasExistingCep) {
      console.log('🔵 [SERVICE] Campo CEP preenchido. Clicando em "Alterar"...');
      await page.evaluate(() => {
        const alterarBtn = document.querySelector('[data-testid="ptz-bag-zip-code-apply"]');
        if (alterarBtn && alterarBtn.textContent.trim() === 'Alterar') {
          alterarBtn.click();
        }
      });
      console.log('🔵 [SERVICE] Aguardando 1s após clicar em "Alterar"...');
      await page.waitForTimeout(1000);
    }

    // Digita o CEP
    console.log(`🔵 [SERVICE] Digitando CEP ${checkoutData.address.cep}...`);
    await page.evaluate((cep) => {
      const input = document.querySelector('#cepSearch');
      if (input) {
        input.value = cep;
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }, checkoutData.address.cep);
    console.log('✅ [SERVICE] CEP digitado');

    console.log('🔵 [SERVICE] Aguardando 3s após digitar CEP...');
    await page.waitForTimeout(3000);

    // Clica em "Aplicar"
    console.log('🔵 [SERVICE] Clicando em botão "Aplicar" CEP...');
    await page.evaluate(() => {
      const aplicarBtn = document.querySelector('[data-testid="ptz-bag-zip-code-apply"]');
      if (aplicarBtn) {
        aplicarBtn.click();
      }
    });
    console.log('✅ [SERVICE] Botão "Aplicar" clicado');

    // Aguardar processamento do CEP (reduzido para evitar timeout BrowserBase)
    const cepProcessingTime = useCloud ? 4000 : 3000;
    console.log(`🔵 [SERVICE] Aguardando processamento do CEP (${cepProcessingTime}ms)...`);
    await page.waitForTimeout(cepProcessingTime);

    logTime(startTime, 'CEP processado');

    // Fazer scroll para baixo para forçar renderização das opções de entrega
    console.log('🔵 [SERVICE] Fazendo scroll para forçar renderização...');
    await page.evaluate(() => {
      window.scrollTo(0, document.body.scrollHeight / 2);
    });
    await page.waitForTimeout(500); // Reduzido de 1000ms

    console.log('🔵 [SERVICE] Aguardando opções de entrega no DOM...');
    try {
      // Aguardar apenas pela existência no DOM, não pela visibilidade
      await page.waitForSelector('.btnCardSelect', {
        timeout: useCloud ? 30000 : 15000,
        state: 'attached', // Apenas attached ao DOM, não precisa estar visível
      });
      console.log('✅ [SERVICE] Opções de entrega encontradas no DOM');

      // Aguardar para garantir que estão renderizadas (reduzido)
      console.log('🔵 [SERVICE] Aguardando opções ficarem interativas...');
      await page.waitForTimeout(1000); // Reduzido de 2000ms

      // Verificar se ficaram visíveis
      const deliveryOptionsVisible = await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('.btnCardSelect'));
        return buttons.some((btn) => {
          const rect = btn.getBoundingClientRect();
          return rect.width > 0 && rect.height > 0;
        });
      });

      console.log(`🔵 [SERVICE] Opções de entrega visíveis: ${deliveryOptionsVisible ? 'SIM' : 'NÃO'}`);

      if (!deliveryOptionsVisible) {
        console.log('⚠️ [SERVICE] Opções não visíveis, fazendo scroll...');
        await page.evaluate(() => {
          const firstBtn = document.querySelector('.btnCardSelect');
          if (firstBtn) {
            firstBtn.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
        });
        await page.waitForTimeout(1000);
      }

      console.log('✅ [SERVICE] Opções de entrega carregadas');
    } catch (err) {
      console.log('❌ [SERVICE] Timeout aguardando opções de entrega');
      console.log('❌ [SERVICE] Erro:', err.message);

      // Debug: capturar estado da página
      const pageDebug = await page.evaluate(() => {
        const buttons = document.querySelectorAll('.btnCardSelect');
        return {
          buttonsCount: buttons.length,
          buttonsHTML: Array.from(buttons)
            .slice(0, 2)
            .map((b) => b.outerHTML.substring(0, 200)),
        };
      });
      console.log('🔍 [SERVICE] Debug opções entrega:', JSON.stringify(pageDebug));

      throw err;
    }
    console.log('🔵 [SERVICE] Selecionando tipo de entrega padrão...');
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
      console.log('❌ [SERVICE] Não foi possível selecionar o tipo de entrega');
      await stagehand.close();
      return { pixCode: null };
    }

    console.log('✅ [SERVICE] Tipo de entrega selecionado');
    console.log('🔵 [SERVICE] Aguardando processamento da entrega...');
    await page.waitForTimeout(2000); // Reduzido de 3000ms

    logTime(startTime, 'Entrega selecionada');

    // === Cupom ===
    if (checkoutData.cupom) {
      console.log(`🔵 [SERVICE] Aplicando cupom ${checkoutData.cupom}...`);
      await page.evaluate((cupom) => {
        const input = document.querySelector('#applyCouponCart');
        if (input) {
          input.value = cupom;
          input.dispatchEvent(new Event('input', { bubbles: true }));
          const apply = input.closest('form')?.querySelector("[type='submit'], .apply-coupon");
          apply?.click();
        }
      }, checkoutData.cupom);

      console.log('🔵 [SERVICE] Aguardando processamento do cupom...');
      await page.waitForTimeout(3000); // Reduzido de 5000ms

      const cupomApplied = await page.evaluate(() => {
        const texto = document.body.textContent.toLowerCase();
        return texto.includes('desconto') || texto.includes('cupom');
      });

      if (cupomApplied) console.log('✅ [SERVICE] Cupom aplicado com sucesso!');
      else console.log('⚠️ [SERVICE] Cupom pode não ter sido aplicado corretamente.');
    } else {
      console.log('🔵 [SERVICE] Nenhum cupom fornecido, pulando...');
    }

    // === AGORA SIM: AJUSTE DE QUANTIDADES (DEPOIS DO CEP E CUPOM) ===
    console.log('🔵 [SERVICE] Iniciando ajuste de quantidades dos produtos no carrinho...');
    await page.waitForTimeout(2000);

    // Ajusta quantidade de cada produto digitando diretamente no input
    for (let i = 0; i < checkoutData.products.length; i++) {
      const product = checkoutData.products[i];
      const targetAmount = product.amount || 1;

      console.log(`🔵 [SERVICE] Produto ${i + 1}: ajustando para ${targetAmount} unidade(s)...`);

      // Verifica quantidade atual
      console.log(`🔵 [SERVICE] Verificando quantidade atual do produto ${i + 1}...`);
      const currentQty = await page.evaluate(({ index }) => {
        const items = document.querySelectorAll('.cart-list-item');
        if (index >= items.length) return null;

        const item = items[index];
        const qtyInput = item.querySelector('input[data-testid="ptz-bag-product-quantity"]');
        return qtyInput ? parseInt(qtyInput.value || '1', 10) : null;
      }, { index: i });

      if (currentQty === null) {
        console.log(`⚠️ [SERVICE] Erro: Produto ${i + 1} não encontrado no carrinho`);
        continue;
      }
      console.log(`🔵 [SERVICE] Quantidade atual do produto ${i + 1}: ${currentQty}`);

      if (currentQty === targetAmount) {
        console.log(`✅ [SERVICE] Quantidade do produto ${i + 1} já correta`);
        continue;
      }

      console.log(`🔵 [SERVICE] Alterando quantidade de ${currentQty} para ${targetAmount}...`);

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

      console.log('✅ [SERVICE] Valor digitado e foco removido do input');

      // Aguarda o loading do carrinho processar
      console.log('🔵 [SERVICE] Aguardando processamento do carrinho (4s)...');
      await page.waitForTimeout(4000);

      // Valida se a quantidade foi alterada
      console.log(`🔵 [SERVICE] Validando nova quantidade do produto ${i + 1}...`);
      const newQty = await page.evaluate(({ index }) => {
        const items = document.querySelectorAll('.cart-list-item');
        if (index >= items.length) return null;

        const item = items[index];
        const qtyInput = item.querySelector('input[data-testid="ptz-bag-product-quantity"]');
        return qtyInput ? parseInt(qtyInput.value || '1', 10) : null;
      }, { index: i });

      if (newQty === targetAmount) {
        console.log(`✅ [SERVICE] Quantidade do produto ${i + 1} confirmada: ${newQty}`);
      } else {
        console.log(`⚠️ [SERVICE] AVISO: Quantidade esperada ${targetAmount}, mas está ${newQty}`);
      }
    }

    console.log('✅ [SERVICE] Todas as quantidades ajustadas!');
    console.log('🔵 [SERVICE] Aguardando 2s...');
    await page.waitForTimeout(2000);

    // === VALIDAÇÃO FINAL DAS QUANTIDADES NO CARRINHO ===
    console.log('🔵 [SERVICE] Verificação final das quantidades no carrinho...');
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
    console.log('🔵 [SERVICE] Validando antes de prosseguir para checkout...');
    const canProceed = await page.evaluate(() => {
      const zip = document.querySelector('#cepSearch')?.value?.trim();
      const deliverySelected = document.querySelector(
        '.btnCardSelect.selected, .btnCardSelect.active',
      );
      return !!zip && !!deliverySelected;
    });

    if (!canProceed) {
      console.log('❌ [SERVICE] Falha na validação antes de prosseguir para pagamento.');
      console.log('❌ [SERVICE] CEP ou tipo de entrega não selecionados corretamente');
      await stagehand.close();
      return { pixCode: null };
    }

    console.log('✅ [SERVICE] Validação OK - CEP e entrega configurados');
    console.log('🔵 [SERVICE] Clicando em "Ir para pagamento"...');
    await page.evaluate(() => {
      const btn = document.querySelector(
        '#cartButtonConfirm, [data-testid="ptz-bag-button-go-to-payment"]',
      );
      btn?.click();
    });
    console.log('✅ [SERVICE] Botão "Ir para pagamento" clicado');

    // 🧩 Trata o caso do popup de endereço
    console.log('🔵 [SERVICE] Verificando se apareceu o pop-up de endereço...');
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
    console.log(`🔵 [SERVICE] Popup de endereço detectado: ${hasAddressPopup ? 'SIM' : 'NÃO'}`);

    if (hasAddressPopup) {
      console.log('🔵 [SERVICE] Popup "Cadastrar endereço" detectado! Clicando em "Cadastrar"...');
      await page.evaluate(() => {
        const cadastrarBtn = Array.from(document.querySelectorAll('button')).find((el) =>
          el.textContent
            ?.trim()
            .toLowerCase()
            .includes('cadastrar'),
        );
        cadastrarBtn?.click();
      });

      console.log('🔵 [SERVICE] Aguardando 2s após clicar em Cadastrar...');
      await page.waitForTimeout(2000);

      // Segundo modal (formulário de endereço)
      console.log('🔵 [SERVICE] Aguardando formulário de endereço (timeout 10s)...');
      await page.waitForSelector('[data-testid="ptz-bag-address-register-number"]', {
        timeout: 10000,
      });
      console.log('✅ [SERVICE] Formulário de endereço encontrado');
      console.log('🔵 [SERVICE] Preenchendo novo endereço...');

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

      console.log('🔵 [SERVICE] Endereço preenchido, aguardando confirmação (5s)...');
      await page.waitForTimeout(5000);
      console.log('✅ [SERVICE] Endereço cadastrado');
    } else {
      console.log('✅ [SERVICE] Nenhum popup de endereço encontrado, seguindo normalmente...');
    }

    // === Página de pagamento ===
    console.log('🔵 [SERVICE] Aguardando página de pagamento (timeout 15s)...');
    try {
      await page.waitForSelector('[data-testid="ptz-checkout-title"]', { timeout: 15000 });
      console.log('✅ [SERVICE] Página de pagamento detectada com sucesso!');
    } catch (e) {
      console.log('❌ [SERVICE] Não foi possível detectar a página de pagamento');
      console.log('❌ [SERVICE] Erro:', e.message);
      console.log('🔍 [SERVICE] Tentando capturar o título atual da página...');
      const currentTitle = await page.title();
      console.log(`🔵 [SERVICE] Título atual: "${currentTitle}"`);
      await stagehand.close();
      return { pixCode: null };
    }

    // === VALIDAÇÃO DOS PRODUTOS ===
    console.log('🔵 [SERVICE] Validando produtos na página de checkout...');
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
    console.log('🔵 [SERVICE] Validando endereço de entrega na página de checkout...');
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
    console.log('🔵 [SERVICE] Selecionando pagamento PIX...');
    const pixClicked = await page.evaluate(() => {
      const pixBtn = document.querySelector('[data-testid="ptz-payment-method-pix"]');
      if (pixBtn) {
        pixBtn.click();
        return true;
      }
      return false;
    });

    if (!pixClicked) {
      console.log('⚠️ [SERVICE] Não encontrou PIX pelo data-testid, tentando fallback...');
      await page.evaluate(() => {
        const pixElements = Array.from(
          document.querySelectorAll('.payment-method-item'),
        ).find((el) => el.textContent?.toLowerCase().includes('pix'));
        pixElements?.click();
      });
      console.log('✅ [SERVICE] PIX clicado via fallback');
    } else {
      console.log('✅ [SERVICE] PIX clicado via data-testid');
    }

    console.log('🔵 [SERVICE] Aguardando confirmação da seleção do PIX (2s)...');
    await page.waitForTimeout(2000);

    // === BOTÃO PAGAR AGORA OTIMIZADO ===
    console.log('🔵 [SERVICE] Procurando botão "Pagar agora"...');
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
      console.log('❌ [SERVICE] Não encontrou botão "Pagar agora"');
      await stagehand.close();
      return { pixCode: null };
    }
    console.log('✅ [SERVICE] Botão "Pagar agora" clicado');

    console.log('🔵 [SERVICE] Aguardando página de PIX carregar (8s)...');
    await page.waitForTimeout(8000);

    console.log('🔵 [SERVICE] Procurando código PIX na página...');
    const pixCode = await page.evaluate(() => {
      const codeEl = document.querySelector('.PaymentMethod_pix-text__0hUPV');
      return codeEl?.textContent?.trim() || null;
    });

    if (pixCode) {
      console.log('✅ [SERVICE] Código PIX obtido:', pixCode);

      console.log('🔵 [SERVICE] Salvando código PIX em arquivo...');
      try {
        fs.mkdirSync(path.dirname(PIX_FILE), { recursive: true });
        fs.writeFileSync(
          PIX_FILE,
          JSON.stringify({ pix: pixCode, ts: Date.now() }, null, 2),
          'utf8',
        );
        console.log('✅ [SERVICE] PIX salvo em', PIX_FILE);
      } catch (err) {
        console.error('❌ [SERVICE] Erro ao salvar PIX em arquivo:', err);
      }
    } else {
      console.log('❌ [SERVICE] Não foi possível encontrar o código PIX');
      console.log('⚠️ [SERVICE] Elemento .PaymentMethod_pix-text__0hUPV não encontrado na página');
    }

    console.log('🔵 [SERVICE] Salvando sessão...');
    await saveSession(page);
    console.log('✅ [SERVICE] Sessão salva');

    const close = async () => {
      try {
        console.log('🔵 [SERVICE] Fechando Stagehand manualmente...');
        await stagehand.close();
        console.log('✅ [SERVICE] Stagehand fechado com sucesso');
      } catch (err) {
        console.error('❌ [SERVICE] Erro ao fechar Stagehand:', err);
      }
    };

    console.log('🚀 [SERVICE] Finalizando runCheckoutFlow e retornando resultado...');
    console.log('🚀 [SERVICE] PIX:', pixCode ? 'OBTIDO' : 'NULL');
    logTime(startTime, 'PROCESSO COMPLETO');
    return { pixCode, address: addressInfo, products: productsInfo, close };
  } catch (error) {
    console.error('❌ [SERVICE] Erro durante o processo de checkout:', error);
    console.error('❌ [SERVICE] Stack:', error.stack);
    if (stagehand) {
      try {
        console.log('🔵 [SERVICE] Tentando fechar navegador após erro...');
        await stagehand.close();
        console.log('✅ [SERVICE] Navegador fechado após erro');
      } catch (closeError) {
        console.error('❌ [SERVICE] Erro ao fechar navegador após falha:', closeError);
      }
    }
    throw error;
  }
};

export default { runCheckoutFlow };
