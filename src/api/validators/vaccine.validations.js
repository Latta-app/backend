import Joi from 'joi';

export const validateVaccineCreate = (data) => {
  const schema = Joi.object({
    pet_id: Joi.string().uuid().required(),
    protocol_id: Joi.string().uuid().required(),
    name: Joi.string().required(),
    date_administered: Joi.date().required(),
    next_due_date: Joi.date().required()
  });

  return schema.validate(data);
};

export const validateVaccineUpdate = (data) => {
  const schema = Joi.object({
    name: Joi.string(),
    date_administered: Joi.date(),
    next_due_date: Joi.date(),
    protocol_id: Joi.string().uuid()
  });

  return schema.validate(data);
};