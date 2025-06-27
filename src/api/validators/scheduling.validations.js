import Joi from 'joi';

export const validateSchedulingCreate = (data) => {
  const schema = Joi.object({
    clinic_id: Joi.string()
      .uuid()
      .required()
      .messages({
        'string.empty': 'O ID da clínica é obrigatório',
        'string.uuid': 'O ID da clínica deve ser um UUID válido',
        'any.required': 'O ID da clínica é obrigatório',
      }),
    service_type_id: Joi.string()
      .uuid()
      .required()
      .messages({
        'string.empty': 'O ID do tipo de serviço é obrigatório',
        'string.uuid': 'O ID do tipo de serviço deve ser um UUID válido',
        'any.required': 'O ID do tipo de serviço é obrigatório',
      }),
    scheduling_status_id: Joi.string()
      .uuid()
      .messages({
        'string.uuid': 'O ID do status do agendamento deve ser um UUID válido',
      }),
    user_id: Joi.string()
      .uuid()
      .allow(null)
      .messages({
        'string.uuid': 'O ID do usuário deve ser um UUID válido',
      }),
    plan_id: Joi.string()
      .uuid()
      .allow(null)
      .messages({
        'string.uuid': 'O ID do plano deve ser um UUID válido',
      }),
    pet_id: Joi.string()
      .uuid()
      .required()
      .messages({
        'string.empty': 'O ID do pet é obrigatório',
        'string.uuid': 'O ID do pet deve ser um UUID válido',
        'any.required': 'O ID do pet é obrigatório',
      }),
    pet_owner_id: Joi.string()
      .uuid()
      .required()
      .messages({
        'string.empty': 'O ID do dono do pet é obrigatório',
        'string.uuid': 'O ID do dono do pet deve ser um UUID válido',
        'any.required': 'O ID do dono do pet é obrigatório',
      }),
    payment_method_id: Joi.string()
      .uuid()
      .allow(null)
      .messages({
        'string.uuid': 'O ID do método de pagamento deve ser um UUID válido',
      }),
    payment_status_id: Joi.string()
      .uuid()
      .allow(null)
      .messages({
        'string.uuid': 'O ID do status de pagamento deve ser um UUID válido',
      }),
    appointment_date: Joi.date()
      .required()
      .messages({
        'date.base': 'A data do agendamento deve ser uma data válida',
        'any.required': 'A data do agendamento é obrigatória',
      }),
    start_time: Joi.string()
      .required()
      .pattern(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/)
      .messages({
        'string.base': 'A hora de início deve ser uma string',
        'string.pattern.base': 'A hora de início deve estar no formato HH:MM',
        'any.required': 'A hora de início é obrigatória',
      }),
    end_time: Joi.string()
      .required()
      .pattern(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/)
      .messages({
        'string.base': 'A hora de término deve ser uma string',
        'string.pattern.base': 'A hora de término deve estar no formato HH:MM',
        'any.required': 'A hora de término é obrigatória',
      }),
    price: Joi.number()
      .precision(2)
      .allow(null)
      .messages({
        'number.base': 'O preço deve ser um número',
        'number.precision': 'O preço deve ter no máximo 2 casas decimais',
      }),
    notes: Joi.string()
      .allow(null, '')
      .messages({
        'string.base': 'As observações devem ser um texto',
      }),
    is_confirmed: Joi.boolean().messages({
      'boolean.base': 'O campo de confirmação deve ser um booleano',
    }),
    frequency: Joi.object({
      type: Joi.string().required(),
      value: Joi.number(),
      interval: Joi.object(),
    }).allow(null),
    endCondition: Joi.object({
      type: Joi.string().required(),
      value: Joi.number(),
      interval: Joi.object(),
    }).allow(null),
  });

  return schema.validate(data, { abortEarly: false });
};

export const validateSchedulingUpdate = (data) => {
  const schema = Joi.object({
    id: Joi.string()
      .uuid()
      .messages({
        'string.uuid': 'O ID deve ser um UUID válido',
      }),
    clinic_id: Joi.string()
      .uuid()
      .messages({
        'string.uuid': 'O ID da clínica deve ser um UUID válido',
      }),
    service_type_id: Joi.string()
      .uuid()
      .messages({
        'string.uuid': 'O ID do tipo de serviço deve ser um UUID válido',
      }),
    scheduling_status_id: Joi.string()
      .uuid()
      .messages({
        'string.uuid': 'O ID do status do agendamento deve ser um UUID válido',
      }),
    user_id: Joi.string()
      .uuid()
      .allow(null)
      .messages({
        'string.uuid': 'O ID do usuário deve ser um UUID válido',
      }),
    plan_id: Joi.string()
      .uuid()
      .allow(null)
      .messages({
        'string.uuid': 'O ID do plano deve ser um UUID válido',
      }),
    pet_id: Joi.string()
      .uuid()
      .messages({
        'string.uuid': 'O ID do pet deve ser um UUID válido',
      }),
    pet_owner_id: Joi.string()
      .uuid()
      .messages({
        'string.uuid': 'O ID do dono do pet deve ser um UUID válido',
      }),
    payment_method_id: Joi.string()
      .uuid()
      .allow(null)
      .messages({
        'string.uuid': 'O ID do método de pagamento deve ser um UUID válido',
      }),
    payment_status_id: Joi.string()
      .uuid()
      .allow(null)
      .messages({
        'string.uuid': 'O ID do status de pagamento deve ser um UUID válido',
      }),
    appointment_date: Joi.date().messages({
      'date.base': 'A data do agendamento deve ser uma data válida',
    }),
    start_time: Joi.date().messages({
      'date.base': 'A hora de início deve ser uma data válida',
    }),
    end_time: Joi.date().messages({
      'date.base': 'A hora de término deve ser uma data válida',
    }),
    price: Joi.number()
      .precision(2)
      .allow(null)
      .messages({
        'number.base': 'O preço deve ser um número',
        'number.precision': 'O preço deve ter no máximo 2 casas decimais',
      }),
    notes: Joi.string()
      .allow(null, '')
      .messages({
        'string.base': 'As observações devem ser um texto',
      }),
    is_confirmed: Joi.boolean().messages({
      'boolean.base': 'O campo de confirmação deve ser um booleano',
    }),
    // Novos campos adicionados baseados no objeto fornecido
    frequency: Joi.object({
      type: Joi.string()
        .valid('no_repeat', 'daily', 'weekly', 'monthly', 'yearly')
        .messages({
          'string.base': 'O tipo de frequência deve ser um texto',
          'any.only': 'O tipo de frequência deve ser: no_repeat, daily, weekly, monthly ou yearly',
        }),
      value: Joi.number()
        .integer()
        .min(1)
        .messages({
          'number.base': 'O valor da frequência deve ser um número',
          'number.integer': 'O valor da frequência deve ser um número inteiro',
          'number.min': 'O valor da frequência deve ser maior que 0',
        }),
      interval: Joi.object({
        label: Joi.string().messages({
          'string.base': 'O rótulo do intervalo deve ser um texto',
        }),
        value: Joi.string()
          .valid('days', 'weeks', 'months', 'years')
          .messages({
            'string.base': 'O valor do intervalo deve ser um texto',
            'any.only': 'O valor do intervalo deve ser: days, weeks, months ou years',
          }),
      }).messages({
        'object.base': 'O intervalo deve ser um objeto válido',
      }),
    })
      .allow(null)
      .messages({
        'object.base': 'A frequência deve ser um objeto válido',
      }),
    endCondition: Joi.object({
      type: Joi.string()
        .valid('never', 'after', 'on_date')
        .messages({
          'string.base': 'O tipo de condição de fim deve ser um texto',
          'any.only': 'O tipo de condição de fim deve ser: never, after ou on_date',
        }),
      value: Joi.alternatives()
        .try(
          Joi.number()
            .integer()
            .min(1),
          Joi.date(),
          Joi.string().allow(''),
        )
        .messages({
          'alternatives.match': 'O valor da condição de fim deve ser um número, data ou texto',
        }),
      interval: Joi.object({
        label: Joi.string().messages({
          'string.base': 'O rótulo do intervalo deve ser um texto',
        }),
        value: Joi.string()
          .valid('days', 'weeks', 'months', 'years')
          .messages({
            'string.base': 'O valor do intervalo deve ser um texto',
            'any.only': 'O valor do intervalo deve ser: days, weeks, months ou years',
          }),
      })
        .allow(null)
        .messages({
          'object.base': 'O intervalo deve ser um objeto válido',
        }),
    })
      .allow(null)
      .messages({
        'object.base': 'A condição de fim deve ser um objeto válido',
      }),
  });

  return schema.validate(data, { abortEarly: false });
};
