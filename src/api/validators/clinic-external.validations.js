import Joi from 'joi';

export const validateExternalPet = (data, { partial = false } = {}) => {
  const baseSchema = {
    name: Joi.string().min(1).max(120),
    species: Joi.string().max(60).allow(null, ''),
    breed: Joi.string().max(120).allow(null, ''),
    birthdate: Joi.alternatives()
      .try(Joi.date(), Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/))
      .allow(null),
    weight_kg: Joi.number().min(0).max(200).allow(null),
    notes: Joi.string().max(2000).allow(null, ''),
  };
  const schema = partial
    ? Joi.object(baseSchema)
    : Joi.object({ ...baseSchema, name: baseSchema.name.required() });
  return schema.validate(data, { abortEarly: false, allowUnknown: false, stripUnknown: true });
};

export const validateExternalContact = (data, { partial = false } = {}) => {
  const baseSchema = {
    name: Joi.string().min(1).max(120),
    phone: Joi.string().max(40).allow(null, ''),
    email: Joi.string().email().max(200).allow(null, ''),
    notes: Joi.string().max(2000).allow(null, ''),
  };
  const schema = partial
    ? Joi.object(baseSchema)
    : Joi.object({ ...baseSchema, name: baseSchema.name.required() });
  return schema.validate(data, { abortEarly: false, allowUnknown: false, stripUnknown: true });
};
