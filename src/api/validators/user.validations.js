import Joi from 'joi';

export const validateUserCreate = (data) => {
  const schema = Joi.object({
    name: Joi.string()
      .min(3)
      .required(),
    email: Joi.string()
      .email()
      .required(),
    password: Joi.string()
      .min(3)
      .required(),
    phone: Joi.string()
      .pattern(/^\d{12,15}$/)
      .required(),
    role_id: Joi.string()
      .uuid()
      .required(),
    clinicId: Joi.string()
      .uuid()
      .optional(),
  });

  return schema.validate(data, { abortEarly: false });
};

export const validateVeterinaryCreate = (data) => {
  const schema = Joi.object({
    name: Joi.string()
      .min(3)
      .required(),
    email: Joi.string()
      .email()
      .required(),
    password: Joi.string()
      .min(3)
      .required(),
    clinicId: Joi.string()
      .uuid()
      .optional(),
  });

  return schema.validate(data, { abortEarly: false });
};

export const validatePetOwnerCreate = (data) => {
  const schema = Joi.object({
    name: Joi.string()
      .min(3)
      .required(),
    email: Joi.string()
      .email()
      .required(),
    password: Joi.string()
      .min(3)
      .required(),
    clinicId: Joi.string()
      .uuid()
      .optional(),
  });

  return schema.validate(data, { abortEarly: false });
};

export const validateUserUpdate = (data) => {
  const schema = Joi.object({
    id: Joi.string()
      .uuid()
      .required(),
    name: Joi.string()
      .min(3)
      .required(),
    email: Joi.string()
      .email()
      .optional(),
    password: Joi.string()
      .min(8)
      .optional(),
    role: Joi.string()
      .valid('vet', 'tutor')
      .optional(),
  }).min(1);

  return schema.validate(data, { abortEarly: false });
};
