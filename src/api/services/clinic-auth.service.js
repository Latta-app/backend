import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import ClinicUserRepository from '../repositories/clinic-user.repository.js';

const ACTIVATION_TTL_DAYS = 7;
const RESET_TTL_HOURS = 1;
const LOGIN_TTL = '12h';
const BCRYPT_ROUNDS = 10;

const CLINIC_AUTH_SECRET =
  process.env.CLINIC_AUTH_JWT_SECRET || process.env.JWT_SECRET;
const FRONTEND_URL_RAW = process.env.FRONTEND_URL || 'https://latta.app.br';
const FRONTEND_URL = FRONTEND_URL_RAW.split(',')[0].trim();
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const ACTIVATION_FROM = process.env.CLINIC_AUTH_EMAIL_FROM || 'Latta <painel@latta.app.br>';

const signToken = (payload, expiresIn) =>
  jwt.sign(payload, CLINIC_AUTH_SECRET, { expiresIn });

const verifyToken = (token) => {
  try {
    return jwt.verify(token, CLINIC_AUTH_SECRET);
  } catch (err) {
    const e = new Error(`Token inválido: ${err.message}`);
    e.code = 'INVALID_TOKEN';
    throw e;
  }
};

const sendEmail = async ({ to, subject, html }) => {
  if (!RESEND_API_KEY) {
    return { sent: false, error: 'resend_not_configured' };
  }
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from: ACTIVATION_FROM, to: [to], subject, html }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      return { sent: false, error: `resend_${res.status}: ${body.slice(0, 200)}` };
    }
    return { sent: true };
  } catch (err) {
    return { sent: false, error: `resend_throw: ${err.message}` };
  }
};

export const requestActivationLink = async ({ clinicId, email }) => {
  if (!clinicId || !email) throw new Error('clinicId e email são obrigatórios');

  const clinic = await ClinicUserRepository.getClinic(clinicId);
  if (!clinic) {
    const err = new Error('Clinic not found');
    err.code = 'NOT_FOUND';
    throw err;
  }

  const expiresAt = new Date(Date.now() + ACTIVATION_TTL_DAYS * 24 * 60 * 60 * 1000);
  const token = signToken(
    { clinic_id: clinicId, email: email.toLowerCase(), purpose: 'activation' },
    `${ACTIVATION_TTL_DAYS}d`,
  );

  const user = await ClinicUserRepository.upsertForActivation({
    clinicId,
    email,
    token,
    expiresAt,
  });

  const url = `${FRONTEND_URL}/clinica/ativar?token=${encodeURIComponent(token)}`;

  const emailResult = await sendEmail({
    to: email,
    subject: `Ative o painel da ${clinic.name} na Latta`,
    html: `
      <p>Olá!</p>
      <p>Acesse o painel da clínica <b>${clinic.name}</b> definindo uma senha pelo link abaixo (válido por ${ACTIVATION_TTL_DAYS} dias):</p>
      <p><a href="${url}">${url}</a></p>
      <p>Se não foi você quem solicitou, ignore este email.</p>
    `,
  });

  return { user, url, email: emailResult };
};

export const activate = async ({ token, password }) => {
  if (!token || !password) throw new Error('token e password são obrigatórios');
  if (password.length < 6) throw new Error('senha deve ter no mínimo 6 caracteres');

  const decoded = verifyToken(token);
  if (decoded.purpose !== 'activation') {
    const e = new Error('Token de propósito inválido');
    e.code = 'INVALID_TOKEN';
    throw e;
  }

  const user = await ClinicUserRepository.findByActivationToken(token);
  if (!user) {
    const e = new Error('Token de ativação não encontrado ou já usado');
    e.code = 'INVALID_TOKEN';
    throw e;
  }
  if (user.activation_token_expires_at && new Date(user.activation_token_expires_at) < new Date()) {
    const e = new Error('Token expirado');
    e.code = 'INVALID_TOKEN';
    throw e;
  }

  const hash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  const activated = await ClinicUserRepository.setPasswordAndActivate({
    id: user.id,
    passwordHash: hash,
  });
  await ClinicUserRepository.setClinicActivated(user.clinic_id);

  return { user: activated };
};

export const login = async ({ email, password }) => {
  if (!email || !password) {
    const e = new Error('email e password são obrigatórios');
    e.code = 'INVALID_CREDENTIALS';
    throw e;
  }
  const user = await ClinicUserRepository.findByEmail(email);
  if (!user || !user.password_hash) {
    const e = new Error('Email ou senha inválidos');
    e.code = 'INVALID_CREDENTIALS';
    throw e;
  }
  const match = await bcrypt.compare(password, user.password_hash);
  if (!match) {
    const e = new Error('Email ou senha inválidos');
    e.code = 'INVALID_CREDENTIALS';
    throw e;
  }
  await ClinicUserRepository.touchLastLogin(user.id);
  const clinic = await ClinicUserRepository.getClinic(user.clinic_id);
  const token = signToken(
    {
      id: user.id,
      email: user.email,
      clinic_id: user.clinic_id,
      role: { role: 'clinic' },
    },
    LOGIN_TTL,
  );
  return {
    token,
    user: {
      id: user.id,
      email: user.email,
      clinic_id: user.clinic_id,
      clinic_name: clinic?.name || null,
      role: { role: 'clinic' },
    },
  };
};

export const requestPasswordReset = async ({ email }) => {
  if (!email) throw new Error('email obrigatório');
  const user = await ClinicUserRepository.findByEmail(email);
  // Anti-enumeration: sempre retorna ok, mas so manda email se user existe
  if (!user) return { sent: false, reason: 'no_user' };

  const expiresAt = new Date(Date.now() + RESET_TTL_HOURS * 60 * 60 * 1000);
  const token = signToken(
    { sub: user.id, clinic_id: user.clinic_id, purpose: 'password_reset' },
    `${RESET_TTL_HOURS}h`,
  );
  await ClinicUserRepository.setResetToken({ id: user.id, token, expiresAt });

  const url = `${FRONTEND_URL}/clinica/redefinir-senha?token=${encodeURIComponent(token)}`;
  const result = await sendEmail({
    to: email,
    subject: 'Redefinir senha do painel Latta',
    html: `
      <p>Recebemos um pedido pra redefinir sua senha. Use o link abaixo (válido por ${RESET_TTL_HOURS} hora):</p>
      <p><a href="${url}">${url}</a></p>
      <p>Se não foi você, ignore este email.</p>
    `,
  });
  return { sent: result.sent, error: result.error };
};

export const resetPassword = async ({ token, password }) => {
  if (!token || !password) throw new Error('token e password obrigatórios');
  if (password.length < 6) throw new Error('senha deve ter no mínimo 6 caracteres');

  const decoded = verifyToken(token);
  if (decoded.purpose !== 'password_reset') {
    const e = new Error('Token de propósito inválido');
    e.code = 'INVALID_TOKEN';
    throw e;
  }
  const user = await ClinicUserRepository.findByResetToken(token);
  if (!user) {
    const e = new Error('Token não encontrado ou já usado');
    e.code = 'INVALID_TOKEN';
    throw e;
  }
  if (user.password_reset_expires_at && new Date(user.password_reset_expires_at) < new Date()) {
    const e = new Error('Token expirado');
    e.code = 'INVALID_TOKEN';
    throw e;
  }
  const hash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  await ClinicUserRepository.resetPassword({ id: user.id, passwordHash: hash });
  return { ok: true };
};

export default {
  requestActivationLink,
  activate,
  login,
  requestPasswordReset,
  resetPassword,
};
