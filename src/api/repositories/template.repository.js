import { Template, TemplateVariable, TemplateVariableType } from '../models/index.js';

const getAllTemplates = async ({ page = 1, limit = 15 }) => {
  try {
    // const offset = (page - 1) * limit;

    const { count: totalItems, rows: templates } = await Template.findAndCountAll({
      attributes: [
        'id',
        'template_id',
        'template_name',
        'template_label',
        'template_language',
        'template_status',
        'template_preview',
        'template_category',
      ],
      include: [
        {
          model: TemplateVariable,
          as: 'variables',
          attributes: [
            'id',
            'template_id',
            'template_component_id',
            'template_component_type_id',
            'template_varible_type_id', // Note: corrigir typo se possível
            'variable_position',
          ],
          include: [
            {
              model: TemplateVariableType,
              as: 'templateVariableType',
              attributes: ['id', 'type', 'description', 'n8n_formula'],
            },
          ],
        },
      ],
      // limit,
      // offset,
      order: [
        ['template_label', 'ASC'],
        // Ordenar as variáveis por posição também
        [{ model: TemplateVariable, as: 'variables' }, 'variable_position', 'ASC'],
      ],
    });

    return {
      templates,
      totalItems,
    };
  } catch (error) {
    throw new Error(`Repository error: ${error.message}`);
  }
};

const getTemplateById = async ({ id }) => {
  try {
    const template = await Template.findOne({
      where: {
        id,
      },
      order: [['template_label', 'ASC']],
      attributes: [
        'id',
        'template_id',
        'template_name',
        'template_label',
        'template_language',
        'template_status',
        'template_preview',
        'template_category',
      ],
    });

    return template;
  } catch (error) {
    throw new Error(`Repository error: ${error.message}`);
  }
};

const searchTemplates = async ({ name, page = 1, limit = 15 }) => {
  try {
    const { Op } = require('sequelize');
    // const offset = (page - 1) * limit;

    const whereConditions = {};

    if (name) {
      whereConditions.template_name = { [Op.iLike]: `%${name}%` };
    }

    const { count: totalItems, rows: templates } = await Template.findAndCountAll({
      where: whereConditions,
      attributes: [
        'id',
        'template_id',
        'template_name',
        'template_label',
        'template_language',
        'template_status',
        'template_preview',
        'template_category',
      ],
      // limit,
      // offset,
      order: [['template_label', 'ASC']],
    });

    return {
      templates,
      totalItems,
    };
  } catch (error) {
    throw new Error(`Repository error: ${error.message}`);
  }
};

export default {
  getAllTemplates,
  getTemplateById,
  searchTemplates,
};
