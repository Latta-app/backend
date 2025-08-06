import TemplateService from '../services/template.service.js';

const getAllTemplates = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 15;

    const result = await TemplateService.getAllTemplates({
      page,
      limit,
    });

    return res.status(200).json({
      code: 'TEMPLATES_RETRIEVED',
      data: result.templates,
      pagination: {
        totalItems: result.totalItems,
        totalPages: result.totalPages,
        currentPage: page,
        limit,
      },
    });
  } catch (error) {
    console.error('Error retrieving templates:', error);
    return res.status(500).json({
      code: 'TEMPLATES_RETRIEVAL_ERROR',
      message: error.message,
    });
  }
};

const getTemplateById = async (req, res) => {
  try {
    const { id } = req.params;

    const template = await TemplateService.getTemplateById({ id });

    return res.status(200).json({
      code: 'TEMPLATE_RETRIEVED',
      data: template,
    });
  } catch (error) {
    console.error('Error retrieving template:', error);
    const statusCode = error.message.includes('not found') ? 404 : 500;
    return res.status(statusCode).json({
      code: 'TEMPLATE_RETRIEVAL_ERROR',
      message: error.message,
    });
  }
};

const searchTemplates = async (req, res) => {
  try {
    const { query, page = 1, limit = 15 } = req.query;

    const result = await TemplateService.searchTemplates({
      query,
      page: parseInt(page),
      limit: parseInt(limit),
    });

    return res.status(200).json({
      code: 'TEMPLATES_SEARCH_SUCCESS',
      data: result.templates,
      pagination: {
        totalItems: result.totalItems,
        totalPages: result.totalPages,
        currentPage: parseInt(page),
        limit: parseInt(limit),
      },
    });
  } catch (error) {
    console.error('Error searching templates:', error);
    return res.status(500).json({
      code: 'TEMPLATES_SEARCH_ERROR',
      message: error.message,
    });
  }
};

export default {
  getAllTemplates,
  getTemplateById,
  searchTemplates,
};
