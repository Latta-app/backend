import TemplateRepository from '../repositories/template.repository.js';
import { normalizeQuery } from '../../utils/normalizeQuery.js';

const getAllTemplates = async ({ page = 1, limit = 15 }) => {
  try {
    const result = await TemplateRepository.getAllTemplates({
      page,
      limit,
    });

    return {
      templates: result.templates,
      totalItems: result.totalItems,
      totalPages: Math.ceil(result.totalItems / limit),
    };
  } catch (error) {
    throw new Error(`Service error: ${error.message}`);
  }
};

const getTemplateById = async ({ id }) => {
  try {
    const template = await TemplateRepository.getTemplateById({ id });

    if (!template) {
      throw new Error('Template not found');
    }

    return template;
  } catch (error) {
    throw new Error(`Service error: ${error.message}`);
  }
};

const searchTemplates = async ({ query, page = 1, limit = 15 }) => {
  try {
    const cleanedQuery = normalizeQuery(query);
    const name = cleanedQuery || null;

    const result = await TemplateRepository.searchTemplates({
      name,
      page,
      limit,
    });

    return {
      templates: result.templates,
      totalItems: result.totalItems,
      totalPages: Math.ceil(result.totalItems / limit),
    };
  } catch (error) {
    throw new Error(`Service error: ${error.message}`);
  }
};

export default {
  getAllTemplates,
  getTemplateById,
  searchTemplates,
};
