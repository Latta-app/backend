import { Stagehand } from '@browserbasehq/stagehand';

const runDownload = async (url) => {
  console.log('🚀 [service] Iniciando Stagehand para baixar imagem...');
  let stagehand = null;

  try {
    const useCloud = process.env.USE_BROWSERBASE === 'true';
    stagehand = new Stagehand({
      env: useCloud ? 'BROWSERBASE' : 'LOCAL',
      apiKey: process.env.BROWSERBASE_API_KEY,
      projectId: process.env.BROWSERBASE_PROJECT_ID,
    });

    await stagehand.init();
    const page = stagehand.page;

    console.log('🌐 [service] Acessando URL:', url);
    await page.goto('about:blank'); // limpa contexto
    await page.goto(url, { waitUntil: 'domcontentloaded' });

    console.log('📥 [service] Baixando imagem via fetch no contexto do navegador...');

    const base64 = await page.evaluate(async (imageUrl) => {
      const response = await fetch(imageUrl);
      const arrayBuffer = await response.arrayBuffer();
      const binary = Array.from(new Uint8Array(arrayBuffer))
        .map((b) => String.fromCharCode(b))
        .join('');
      return btoa(binary);
    }, url);

    await stagehand.close();

    console.log('✅ [service] Download finalizado com sucesso.');
    return {
      imageBase64: base64,
      mimeType: 'image/jpeg',
    };
  } catch (err) {
    if (stagehand) await stagehand.close();
    console.error('❌ [service] Erro no Stagehand:', err);
    throw err;
  }
};

export default { runDownload };
