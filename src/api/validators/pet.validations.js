import Joi from 'joi';

export const validatePetCreate = (data) => {
  const schema = Joi.object({
    pet_owner_id: Joi.string()
      .uuid()
      .required(),
    pet_type_id: Joi.string()
      .uuid()
      .required(),
    name: Joi.string().required(),
    breed: Joi.string().allow(null, ''),
    date_of_birthday: Joi.date().required(),
    photo: Joi.string().allow(null, ''),
  });

  return schema.validate(data);
};

export const validatePetUpdate = (data) => {
  const schema = Joi.object({
    pet_type_id: Joi.string()
      .uuid()
      .required(),
    pet_gender_id: Joi.string()
      .uuid()
      .required(),
    pet_breed_id: Joi.string()
      .uuid()
      .required(),
    pet_color_id: Joi.string()
      .uuid()
      .required(),
    pet_size_id: Joi.string()
      .uuid()
      .required(),
    pet_fur_type_id: Joi.string()
      .uuid()
      .required(),
    pet_fur_length_id: Joi.string()
      .uuid()
      .required(),
    pet_temperament_id: Joi.string()
      .uuid()
      .required(),
    pet_socialization_level_id: Joi.string()
      .uuid()
      .required(),
    pet_living_environment_id: Joi.string()
      .uuid()
      .required(),
    name: Joi.string().required(),
    date_of_birthday: Joi.date().required(),
    photo: Joi.string().allow(null, ''),
    latest_weight: Joi.string()
      .max(7)
      .allow(null, ''),
    microchip_number: Joi.string()
      .max(50)
      .allow(null, ''),
    blood_type: Joi.string()
      .max(20)
      .allow(null, ''),
    is_neutered: Joi.boolean().default(false),
    is_active: Joi.boolean().default(true),
    death_date: Joi.date().allow(null),
  });

  return schema.validate(data);
};
