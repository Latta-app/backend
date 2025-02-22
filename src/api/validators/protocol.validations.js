import Joi from 'joi';

export const validateProtocolCreate = (data) => {
  const schema = Joi.object({
    clinic_id: Joi.string().uuid().required(),
    pet_type_id: Joi.string().uuid().required(),
    vaccine_name: Joi.string().required(),
    initial_dose_age: Joi.number().integer().min(0).required(),
    booster_frequency: Joi.number().integer().min(1).required()
  });

  return schema.validate(data);
};

export const validateProtocolUpdate = (data) => {
  const schema = Joi.object({
    vaccine_name: Joi.string(),
    initial_dose_age: Joi.number().integer().min(0),
    booster_frequency: Joi.number().integer().min(1)
  });

  return schema.validate(data);
};
