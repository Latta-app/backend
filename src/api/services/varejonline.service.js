// src/api/services/varejonline.service.js
import axios from 'axios';

// Configurações OAuth - SUBSTITUA PELAS SUAS CREDENCIAIS
const OAUTH_CONFIG = {
  client_id: '685de71aad8b432065a95608',
  client_secret: 'ff90934ca9442599e5d042318e814c6cd352cd51808b2ef2ec1ec13629136081',
  redirect_uri: 'https://api.latta.app.br/api/oauth/varejonline/callback',
  auth_url: 'https://integrador.varejonline.com.br/apps/oauth/authorization',
  token_url: 'https://erp.varejonline.com.br/apps/oauth/token',
  api_base_url: 'https://integrador.varejonline.com.br/apps/api',
};

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
    const response = await axios.get(`${OAUTH_CONFIG.api_base_url}/terceiros`, {
      params: { token },
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
  try {
    const response = await axios.get(`${OAUTH_CONFIG.api_base_url}/terceiros`, {
      params: { token },
    });

    return response.data;
  } catch (error) {
    console.error('Get terceiros error:', error.response?.data || error.message);
    throw new Error('Erro ao obter terceiros');
  }
};

export default {
  getAuthUrl,
  exchangeCodeForToken,
  testConnection,
  getTerceiros,
};
