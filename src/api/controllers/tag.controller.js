import TagService from '../services/tag.service.js';

const getAllTags = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 15;
    const { clinic_id } = req.user;

    const result = await TagService.getAllTags({
      clinic_id,
      page,
      limit,
    });

    return res.status(200).json({
      code: 'TAGS_RETRIEVED',
      data: result.tags,
      pagination: {
        totalItems: result.totalItems,
        totalPages: result.totalPages,
        currentPage: page,
        limit,
      },
    });
  } catch (error) {
    console.error('Error retrieving tags:', error);
    return res.status(500).json({
      code: 'TAGS_RETRIEVAL_ERROR',
      message: error.message,
    });
  }
};

const getTagById = async (req, res) => {
  try {
    const { id } = req.params;
    const { clinic_id } = req.user;

    const tag = await TagService.getTagById({ id, clinic_id });

    return res.status(200).json({
      code: 'TAG_RETRIEVED',
      data: tag,
    });
  } catch (error) {
    console.error('Error retrieving tag:', error);
    const statusCode = error.message.includes('not found') ? 404 : 500;
    return res.status(statusCode).json({
      code: 'TAG_RETRIEVAL_ERROR',
      message: error.message,
    });
  }
};

const createTag = async (req, res) => {
  try {
    const tagData = req.body;
    const { clinic_id } = req.user;

    const tag = await TagService.createTag({ tagData, clinic_id });

    return res.status(201).json({
      code: 'TAG_CREATED',
      data: tag,
    });
  } catch (error) {
    console.error('Error creating tag:', error);
    const statusCode =
      error.message.includes('required') || error.message.includes('cannot be empty') ? 400 : 500;
    return res.status(statusCode).json({
      code: 'TAG_CREATION_ERROR',
      message: error.message,
    });
  }
};

const updateTag = async (req, res) => {
  try {
    const { id } = req.params;
    const tagData = req.body;
    const { clinic_id } = req.user;

    const updatedTag = await TagService.updateTag({ id, tagData, clinic_id });

    return res.status(200).json({
      code: 'TAG_UPDATED',
      data: updatedTag,
    });
  } catch (error) {
    console.error('Error updating tag:', error);
    const statusCode = error.message.includes('not found')
      ? 404
      : error.message.includes('cannot be empty')
      ? 400
      : 500;
    return res.status(statusCode).json({
      code: 'TAG_UPDATE_ERROR',
      message: error.message,
    });
  }
};

const deleteTag = async (req, res) => {
  try {
    const { id } = req.params;
    const { clinic_id } = req.user;

    await TagService.deleteTag({ id, clinic_id });

    return res.status(200).json({
      code: 'TAG_DELETED',
      message: 'Tag deleted successfully',
    });
  } catch (error) {
    console.error('Error deleting tag:', error);
    const statusCode = error.message.includes('not found') ? 404 : 500;
    return res.status(statusCode).json({
      code: 'TAG_DELETION_ERROR',
      message: error.message,
    });
  }
};

const searchTags = async (req, res) => {
  try {
    const { query, page = 1, limit = 15 } = req.query;
    const { clinic_id } = req.user;

    const result = await TagService.searchTags({
      clinic_id,
      query,
      page: parseInt(page),
      limit: parseInt(limit),
    });

    return res.status(200).json({
      code: 'TAGS_SEARCH_SUCCESS',
      data: result.tags,
      pagination: {
        totalItems: result.totalItems,
        totalPages: result.totalPages,
        currentPage: parseInt(page),
        limit: parseInt(limit),
      },
    });
  } catch (error) {
    console.error('Error searching tags:', error);
    return res.status(500).json({
      code: 'TAGS_SEARCH_ERROR',
      message: error.message,
    });
  }
};

export default {
  getAllTags,
  getTagById,
  createTag,
  updateTag,
  deleteTag,
  searchTags,
};
