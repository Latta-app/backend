// src/api/services/varejonline.service.js
import axios from 'axios';

// Configurações OAuth
const OAUTH_CONFIG = {
  client_id: '685de71aad8b432065a95608',
  client_secret: 'ff90934ca9442599e5d042318e814c6cd352cd51808b2ef2ec1ec13629136081',
  redirect_uri: 'https://api.latta.app.br/api/oauth/varejonline/callback',
  auth_url: 'https://integrador.varejonline.com.br/apps/oauth/authorization',
  token_url: 'https://erp.varejonline.com.br/apps/oauth/token',
  api_base_url: 'https://integrador.varejonline.com.br/apps/api',
};

// ===== CONTROLE DE RATE LIMITING =====
let lastRequestTime = 0;
const MIN_INTERVAL_BETWEEN_REQUESTS = 2000;
const cache = new Map();
const CACHE_DURATION = 60000;

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Função para fazer request com controle de rate limit
const makeControlledRequest = async (url, params = {}) => {
  // Controle de intervalo mínimo
  const now = Date.now();
  const timeSinceLastRequest = now - lastRequestTime;

  if (timeSinceLastRequest < MIN_INTERVAL_BETWEEN_REQUESTS) {
    const waitTime = MIN_INTERVAL_BETWEEN_REQUESTS - timeSinceLastRequest;
    console.log(`⏱️ Aguardando ${waitTime}ms para próximo request...`);
    await delay(waitTime);
  }

  lastRequestTime = Date.now();
  return axios.get(url, { params });
};

// Função para fazer request com retry em caso de 429
const makeRequestWithRetry = async (url, params = {}, maxRetries = 3) => {
  let retryCount = 0;

  while (retryCount < maxRetries) {
    try {
      return await makeControlledRequest(url, params);
    } catch (error) {
      if (error.response?.status === 429 && retryCount < maxRetries - 1) {
        const backoffDelay = Math.pow(2, retryCount) * 5000; // 5s, 10s, 20s
        console.log(
          `🔄 Rate limit (429). Tentativa ${retryCount +
            1}/${maxRetries}. Aguardando ${backoffDelay / 1000}s...`,
        );
        await delay(backoffDelay);
        retryCount++;
        continue;
      }
      throw error;
    }
  }
};

// Função para cache simples
const getCachedData = (key) => {
  const cached = cache.get(key);
  if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
    console.log(`📋 Dados obtidos do cache: ${key}`);
    return cached.data;
  }
  return null;
};

const setCachedData = (key, data) => {
  cache.set(key, { data, timestamp: Date.now() });
};

// ===== FUNÇÕES ORIGINAIS ATUALIZADAS =====

const getAuthUrl = () => {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: OAUTH_CONFIG.client_id,
    redirect_uri: OAUTH_CONFIG.redirect_uri,
  });

  return `${OAUTH_CONFIG.auth_url}?${params.toString()}`;
};

const exchangeCodeForToken = async (authCode) => {
  try {
    // Token exchange não precisa de rate limiting pois é usado raramente
    const response = await axios.post(
      OAUTH_CONFIG.token_url,
      {
        grant_type: 'authorization_code',
        client_id: OAUTH_CONFIG.client_id,
        client_secret: OAUTH_CONFIG.client_secret,
        redirect_uri: OAUTH_CONFIG.redirect_uri,
        code: authCode,
      },
      {
        headers: {
          'Content-Type': 'application/json',
        },
      },
    );

    return response.data;
  } catch (error) {
    console.error('Token exchange error:', error.response?.data || error.message);
    throw new Error('Erro ao trocar código por token');
  }
};

const testConnection = async (token) => {
  try {
    const response = await makeRequestWithRetry(`${OAUTH_CONFIG.api_base_url}/terceiros`, {
      token,
    });

    return {
      status: 'success',
      message: 'Conexão estabelecida com sucesso',
      data: response.data,
    };
  } catch (error) {
    console.error('API connection test error:', error.response?.data || error.message);
    throw new Error('Erro ao testar conexão com API');
  }
};

const getTerceiros = async (token) => {
  const cacheKey = `terceiros_${token?.slice(-10)}`;

  // Verifica cache primeiro
  const cachedData = getCachedData(cacheKey);
  if (cachedData) {
    return cachedData;
  }

  try {
    const response = await makeRequestWithRetry(`${OAUTH_CONFIG.api_base_url}/terceiros`, {
      token,
    });

    // Salva no cache
    setCachedData(cacheKey, response.data);

    return response.data;
  } catch (error) {
    console.error('Get terceiros error:', error.response?.data || error.message);
    throw new Error('Erro ao obter terceiros');
  }
};

const proxyRequest = async (path, query) => {
  const url = `https://integrador.varejonline.com.br/apps/api/${path}`;
  const TOKEN = process.env.VAREJO_API_TOKEN;
  const fullQuery = { ...query, token: TOKEN };

  // Cria chave de cache baseada na URL e parâmetros
  const cacheKey = `proxy_${path}_${JSON.stringify(fullQuery)}`;

  // Verifica cache primeiro (especialmente útil para dados que não mudam frequentemente)
  const cachedData = getCachedData(cacheKey);
  if (cachedData) {
    return cachedData;
  }

  console.log('--- Proxy Request Debug ---');
  console.log('URL base:', url);
  console.log('Query params:', fullQuery);
  console.log('Token length:', TOKEN?.length);

  try {
    const response = await makeRequestWithRetry(url, fullQuery);

    console.log('✅ Response status:', response.status);
    console.log('Response data snippet:', JSON.stringify(response.data).slice(0, 200));

    // Salva no cache
    setCachedData(cacheKey, response.data);

    return response.data;
  } catch (error) {
    console.error('❌ Proxy request error message:', error.message);
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', error.response.data);
      console.error('Response headers:', error.response.headers);
    }
    throw error;
  }
};

export default {
  getAuthUrl,
  exchangeCodeForToken,
  testConnection,
  getTerceiros,
  proxyRequest,
};
