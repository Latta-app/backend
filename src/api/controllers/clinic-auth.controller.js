import Joi from 'joi';
import ClinicAuthService from '../services/clinic-auth.service.js';
import { isClinicPortalEnabled } from '../services/feature-flag.service.js';

const handleAuthError = (res, err, fallbackCode) => {
  if (err.code === 'NOT_FOUND') return res.status(404).json({ code: 'NOT_FOUND', message: err.message });
  if (err.code === 'INVALID_TOKEN') return res.status(400).json({ code: 'INVALID_TOKEN', message: err.message });
  if (err.code === 'INVALID_CREDENTIALS') return res.status(401).json({ code: 'AUTH_FAILED', message: err.message });
  console.error(`[clinic-auth] ${fallbackCode}:`, err.message);
  return res.status(500).json({ code: fallbackCode, message: err.message });
};

const requestActivationSchema = Joi.object({
  clinic_id: Joi.string().uuid().required(),
  email: Joi.string().email().required(),
}).options({ stripUnknown: true });

const activateSchema = Joi.object({
  token: Joi.string().required(),
  password: Joi.string().min(6).max(128).required(),
}).options({ stripUnknown: true });

const loginSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().required(),
}).options({ stripUnknown: true });

const forgotSchema = Joi.object({
  email: Joi.string().email().required(),
}).options({ stripUnknown: true });

const resetSchema = Joi.object({
  token: Joi.string().required(),
  password: Joi.string().min(6).max(128).required(),
}).options({ stripUnknown: true });

export const requestActivation = async (req, res) => {
  const { error, value } = requestActivationSchema.validate(req.body);
  if (error) return res.status(400).json({ code: 'VALIDATION_ERROR', error: error.details });
  try {
    const result = await ClinicAuthService.requestActivationLink({
      clinicId: value.clinic_id,
      email: value.email,
    });
    return res.json({
      code: 'CLINIC_ACTIVATION_LINK_GENERATED',
      data: {
        user_id: result.user.id,
        url: result.url,
        email_dispatched: result.email.sent,
        email_error: result.email.error || null,
      },
    });
  } catch (err) {
    return handleAuthError(res, err, 'ACTIVATION_REQUEST_ERROR');
  }
};

export const activate = async (req, res) => {
  const { error, value } = activateSchema.validate(req.body);
  if (error) return res.status(400).json({ code: 'VALIDATION_ERROR', error: error.details });
  try {
    const result = await ClinicAuthService.activate(value);
    return res.json({
      code: 'CLINIC_ACTIVATED',
      data: { user_id: result.user.id, email: result.user.email },
    });
  } catch (err) {
    return handleAuthError(res, err, 'ACTIVATION_ERROR');
  }
};

export const login = async (req, res) => {
  const { error, value } = loginSchema.validate(req.body);
  if (error) return res.status(400).json({ code: 'VALIDATION_ERROR', error: error.details });
  try {
    const result = await ClinicAuthService.login(value);
    // Gate fatia 07: roles 'clinic' so logam se clinic_portal_v0 ON pro clinic_id
    const enabled = await isClinicPortalEnabled(result?.user?.clinic_id);
    if (!enabled) {
      return res.status(403).json({
        code: 'CLINIC_PORTAL_NOT_IN_BETA',
        message:
          'Sua clínica ainda não está no beta do painel. Fala com a Latta pra entrar na lista.',
      });
    }
    return res.json({ code: 'CLINIC_LOGIN_SUCCESS', data: result });
  } catch (err) {
    return handleAuthError(res, err, 'CLINIC_LOGIN_ERROR');
  }
};

export const forgotPassword = async (req, res) => {
  const { error, value } = forgotSchema.validate(req.body);
  if (error) return res.status(400).json({ code: 'VALIDATION_ERROR', error: error.details });
  try {
    await ClinicAuthService.requestPasswordReset(value);
    // Anti-enumeration: sempre 200, sem revelar se email existe
    return res.json({ code: 'CLINIC_RESET_REQUESTED' });
  } catch (err) {
    return handleAuthError(res, err, 'CLINIC_RESET_REQUEST_ERROR');
  }
};

export const resetPassword = async (req, res) => {
  const { error, value } = resetSchema.validate(req.body);
  if (error) return res.status(400).json({ code: 'VALIDATION_ERROR', error: error.details });
  try {
    await ClinicAuthService.resetPassword(value);
    return res.json({ code: 'CLINIC_PASSWORD_RESET' });
  } catch (err) {
    return handleAuthError(res, err, 'CLINIC_RESET_ERROR');
  }
};

export default { requestActivation, activate, login, forgotPassword, resetPassword };
