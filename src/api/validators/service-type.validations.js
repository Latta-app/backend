import Joi from 'joi';

export const validateServiceTypeCreate = (data) => {
  const schema = Joi.object({
    name: Joi.string()
      .required()
      .max(255)
      .messages({
        'string.empty': 'O nome é obrigatório',
        'string.max': 'O nome não pode ter mais de 255 caracteres',
        'any.required': 'O nome é obrigatório',
      }),
    label: Joi.string()
      .required()
      .max(255)
      .messages({
        'string.empty': 'O rótulo é obrigatório',
        'string.max': 'O rótulo não pode ter mais de 255 caracteres',
        'any.required': 'O rótulo é obrigatório',
      }),
  });

  return schema.validate(data, { abortEarly: false });
};

export const validateServiceTypeUpdate = (data) => {
  const schema = Joi.object({
    name: Joi.string()
      .max(255)
      .messages({
        'string.empty': 'O nome não pode ser vazio',
        'string.max': 'O nome não pode ter mais de 255 caracteres',
      }),
    label: Joi.string()
      .max(255)
      .messages({
        'string.empty': 'O rótulo não pode ser vazio',
        'string.max': 'O rótulo não pode ter mais de 255 caracteres',
      }),
  });

  return schema.validate(data, { abortEarly: false });
};
