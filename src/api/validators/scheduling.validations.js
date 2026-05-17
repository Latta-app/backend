import Joi from 'joi';

const CATEGORIES = [
  'veterinaria',
  'petshop',
  'banho_tosa',
  'hotel',
  'adestramento',
  'dog_walker',
  'funeraria',
  'farmacia',
];

const FREQUENCY = Joi.object({
  type: Joi.string().required(),
  value: Joi.number(),
  interval: Joi.object(),
}).allow(null);

const END_CONDITION = Joi.object({
  type: Joi.string().required(),
  value: Joi.alternatives(Joi.number(), Joi.string()),
  interval: Joi.object(),
}).allow(null);

const TIME_PATTERN = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9])?$/;

export const validateSchedulingCreate = (data) => {
  const schema = Joi.object({
    clinic_id: Joi.string().uuid().required().messages({
      'string.uuid': 'O ID da clínica deve ser um UUID válido',
      'any.required': 'O ID da clínica é obrigatório',
    }),
    pet_id: Joi.string().uuid().required().messages({
      'string.uuid': 'O ID do pet deve ser um UUID válido',
      'any.required': 'O ID do pet é obrigatório',
    }),
    pet_owner_id: Joi.string().uuid().required().messages({
      'string.uuid': 'O ID do dono do pet deve ser um UUID válido',
      'any.required': 'O ID do dono do pet é obrigatório',
    }),
    user_phone: Joi.string().allow(null, ''),
    category: Joi.string().valid(...CATEGORIES).default('veterinaria'),
    appointment_date: Joi.alternatives()
      .try(Joi.date(), Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/))
      .required()
      .messages({ 'any.required': 'A data do agendamento é obrigatória' }),
    start_time: Joi.alternatives().try(
      Joi.string().pattern(TIME_PATTERN),
      Joi.date(),
    ),
    end_time: Joi.alternatives()
      .try(Joi.string().pattern(TIME_PATTERN), Joi.date())
      .allow(null),
    service_requested: Joi.string().allow(null, ''),
    scheduled_service: Joi.string().allow(null, ''),
    notes: Joi.string().allow(null, ''),
    frequency: FREQUENCY,
    endCondition: END_CONDITION,
  });

  return schema.validate(data, { abortEarly: false, allowUnknown: true });
};

export const validateSchedulingUpdate = (data) => {
  const schema = Joi.object({
    clinic_id: Joi.string().uuid().messages({
      'string.uuid': 'O ID da clínica deve ser um UUID válido',
    }),
    pet_id: Joi.string().uuid().messages({
      'string.uuid': 'O ID do pet deve ser um UUID válido',
    }),
    pet_owner_id: Joi.string().uuid().messages({
      'string.uuid': 'O ID do dono do pet deve ser um UUID válido',
    }),
    user_phone: Joi.string().allow(null, ''),
    category: Joi.string().valid(...CATEGORIES),
    appointment_date: Joi.alternatives().try(
      Joi.date(),
      Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/),
    ),
    start_time: Joi.alternatives().try(
      Joi.string().pattern(TIME_PATTERN),
      Joi.date(),
    ),
    end_time: Joi.alternatives()
      .try(Joi.string().pattern(TIME_PATTERN), Joi.date())
      .allow(null),
    service_requested: Joi.string().allow(null, ''),
    scheduled_service: Joi.string().allow(null, ''),
    notes: Joi.string().allow(null, ''),
  });

  return schema.validate(data, { abortEarly: false, allowUnknown: true });
};
