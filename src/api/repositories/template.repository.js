import { Template } from '../models/index.js';

const getAllTemplates = async ({ page = 1, limit = 15 }) => {
  try {
    // const offset = (page - 1) * limit;

    const { count: totalItems, rows: templates } = await Template.findAndCountAll({
      attributes: [
        'id',
        'template_id',
        'template_name',
        'template_language',
        'template_status',
        'template_preview',
        'template_category',
      ],
      // limit,
      // offset,
      order: [['template_name', 'ASC']],
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
      attributes: [
        'id',
        'template_id',
        'template_name',
        'template_language',
        'template_status',
        'template_preview',
        'template_category',
        'created_at',
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
        'template_language',
        'template_status',
        'template_preview',
        'template_category',
      ],
      // limit,
      // offset,
      order: [['template_name', 'ASC']],
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
