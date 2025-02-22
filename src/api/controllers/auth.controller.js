// src/api/controllers/auth.controller.js
import AuthService from '../services/auth.service.js';

const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        code: 'INVALID_REQUEST',
        message: 'Email e senha são obrigatórios',
      });
    }

    const authData = await AuthService.login({ email, password });

    return res.status(200).json({
      code: 'LOGIN_SUCCESS',
      data: authData,
    });
  } catch (error) {
    console.error('Login error:', error);

    if (error.message.includes('Invalid credentials')) {
      return res.status(401).json({
        code: 'AUTH_FAILED',
        message: 'Email ou senha inválidos',
      });
    }

    return res.status(500).json({
      code: 'AUTH_ERROR',
      message: 'Erro ao realizar login',
    });
  }
};

const logout = async (_req, res) => {
  try {
    return res.status(200).json({
      code: 'LOGOUT_SUCCESS',
      message: 'Logout realizado com sucesso',
    });
  } catch (error) {
    console.error('Logout error:', error);
    return res.status(500).json({
      code: 'LOGOUT_ERROR',
      message: 'Erro ao realizar logout',
    });
  }
};

export default {
  login,
  logout,
};
