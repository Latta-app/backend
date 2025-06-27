// src/api/controllers/varejonline.controller.js
import VarejonlineService from '../services/varejonline.service.js';

const startAuth = async (req, res) => {
  try {
    const authUrl = VarejonlineService.getAuthUrl();

    return res.status(200).json({
      code: 'AUTH_URL_GENERATED',
      message: 'URL de autorização gerada com sucesso',
      data: {
        authUrl,
        instructions: 'Acesse esta URL no navegador para autorizar o aplicativo',
      },
    });
  } catch (error) {
    console.error('Start auth error:', error);
    return res.status(500).json({
      code: 'AUTH_URL_ERROR',
      message: 'Erro ao gerar URL de autorização',
    });
  }
};

const handleCallback = async (req, res) => {
  try {
    const { code } = req.query;

    if (!code) {
      return res.status(400).json({
        code: 'MISSING_CODE',
        message: 'Código de autorização não encontrado',
      });
    }

    const tokenData = await VarejonlineService.exchangeCodeForToken(code);

    return res.status(200).json({
      code: 'TOKEN_SUCCESS',
      message: 'Token obtido com sucesso',
      data: tokenData,
    });
  } catch (error) {
    console.error('Callback error:', error);
    return res.status(500).json({
      code: 'TOKEN_ERROR',
      message: 'Erro ao obter token de acesso',
    });
  }
};

const testAPI = async (req, res) => {
  try {
    // Aqui você pode passar o token via query param ou pegar de onde estiver armazenado
    const { token } = req.query;

    if (!token) {
      return res.status(400).json({
        code: 'MISSING_TOKEN',
        message: 'Token de acesso é obrigatório',
      });
    }

    const testResult = await VarejonlineService.testConnection(token);

    return res.status(200).json({
      code: 'API_TEST_SUCCESS',
      message: 'Conexão com API testada com sucesso',
      data: testResult,
    });
  } catch (error) {
    console.error('API test error:', error);
    return res.status(500).json({
      code: 'API_TEST_ERROR',
      message: 'Erro ao testar conexão com API',
    });
  }
};

const getTerceiros = async (req, res) => {
  try {
    const { token } = req.query;

    if (!token) {
      return res.status(400).json({
        code: 'MISSING_TOKEN',
        message: 'Token de acesso é obrigatório',
      });
    }

    const terceiros = await VarejonlineService.getTerceiros(token);

    return res.status(200).json({
      code: 'TERCEIROS_SUCCESS',
      message: 'Terceiros obtidos com sucesso',
      data: terceiros,
    });
  } catch (error) {
    console.error('Get terceiros error:', error);
    return res.status(500).json({
      code: 'TERCEIROS_ERROR',
      message: 'Erro ao obter terceiros',
    });
  }
};

export default {
  startAuth,
  handleCallback,
  testAPI,
  getTerceiros,
};
