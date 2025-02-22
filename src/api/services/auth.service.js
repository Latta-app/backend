// src/api/services/auth.service.js
import jwt from 'jsonwebtoken';
import UserService from './user.service.js';

const generateToken = (user) => {
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      role: user?.role,
      clinic: user.clinic,
      clinic_id: user?.clinic?.id,
    },
    process.env.JWT_SECRET,
    { expiresIn: '24h' },
  );
};

const login = async ({ email, password }) => {
  try {
    const user = await UserService.getUserByEmail({ email, password: true });

    if (!user) {
      throw new Error('Invalid credentials');
    }

    const isPasswordValid = await UserService.comparePassword(password, user.password);
    if (!isPasswordValid) {
      throw new Error('Invalid credentials');
    }

    const token = generateToken(user);

    return { token, user };
  } catch (error) {
    throw new Error(`Login failed: ${error.message}`);
  }
};

const logout = async () => {
  // Como estamos usando JWT sem blacklist,
  // o logout é gerenciado pelo cliente removendo o token
  return true;
};

export default {
  login,
  logout,
};
