import Joi from 'joi';
import { logFromReq } from '../services/clinic-activity-log.service.js';

// Eventos que o FRONTEND pode submeter livremente (whitelist anti-injection).
// Eventos sensíveis (login/cancel/etc) sao gravados pelos respectivos handlers
// backend, nao via essa rota.
const FRONTEND_EVENT_TYPES = new Set([
  'view_section',
  'click_locked_section',
  'click_external_button',
  'open_appointment_detail',
  'open_external_modal',
  'logout',
]);

const schema = Joi.object({
  event_type: Joi.string().min(1).max(64).required(),
  event_data: Joi.object().max(20),
});

export const submit = (req, res) => {
  const { error, value } = schema.validate(req.body, {
    abortEarly: false,
    allowUnknown: false,
    stripUnknown: true,
  });
  if (error) {
    return res.status(400).json({ code: 'VALIDATION_ERROR', error: error.details });
  }
  if (!FRONTEND_EVENT_TYPES.has(value.event_type)) {
    return res.status(400).json({
      code: 'EVENT_TYPE_NOT_ALLOWED',
      message: `event_type "${value.event_type}" não está na whitelist do frontend`,
    });
  }
  logFromReq(req, value.event_type, value.event_data || null);
  return res.status(202).json({ code: 'ACTIVITY_LOGGED' });
};

export default { submit };
