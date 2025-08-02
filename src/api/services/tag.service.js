import TagRepository from '../repositories/tag.repository.js';
import { normalizeQuery } from '../../utils/normalizeQuery.js';

const getAllTags = async ({ clinic_id, page = 1, limit = 15 }) => {
  try {
    const result = await TagRepository.getAllTags({
      clinic_id,
      page,
      limit,
    });

    return {
      tags: result.tags,
      totalItems: result.totalItems,
      totalPages: Math.ceil(result.totalItems / limit),
    };
  } catch (error) {
    throw new Error(`Service error: ${error.message}`);
  }
};

const getTagById = async ({ id, clinic_id }) => {
  try {
    const tag = await TagRepository.getTagById({ id, clinic_id });

    if (!tag) {
      throw new Error('Tag not found');
    }

    return tag;
  } catch (error) {
    throw new Error(`Service error: ${error.message}`);
  }
};

const createTag = async ({ tagData, clinic_id }) => {
  try {
    // Validações básicas
    if (!tagData.name || !tagData.name.trim()) {
      throw new Error('Tag name is required');
    }

    const tag = await TagRepository.createTag({
      tagData: {
        ...tagData,
        name: tagData.name.trim(),
      },
      clinic_id,
    });

    return tag;
  } catch (error) {
    throw new Error(`Service error: ${error.message}`);
  }
};

const updateTag = async ({ id, tagData, clinic_id }) => {
  try {
    // Validações básicas
    if (tagData.name && !tagData.name.trim()) {
      throw new Error('Tag name cannot be empty');
    }

    const updatedData = { ...tagData };
    if (updatedData.name) {
      updatedData.name = updatedData.name.trim();
    }

    const updatedTag = await TagRepository.updateTag({
      id,
      tagData: updatedData,
      clinic_id,
    });

    if (!updatedTag) {
      throw new Error('Tag not found or no changes made');
    }

    return updatedTag;
  } catch (error) {
    throw new Error(`Service error: ${error.message}`);
  }
};

const deleteTag = async ({ id, clinic_id }) => {
  try {
    const deleted = await TagRepository.deleteTag({ id, clinic_id });

    if (!deleted) {
      throw new Error('Tag not found');
    }

    return { success: true };
  } catch (error) {
    throw new Error(`Service error: ${error.message}`);
  }
};

const searchTags = async ({ clinic_id, query, page = 1, limit = 15 }) => {
  try {
    const cleanedQuery = normalizeQuery(query);
    const name = cleanedQuery || null;

    const result = await TagRepository.searchTags({
      clinic_id,
      name,
      page,
      limit,
    });

    return {
      tags: result.tags,
      totalItems: result.totalItems,
      totalPages: Math.ceil(result.totalItems / limit),
    };
  } catch (error) {
    throw new Error(`Service error: ${error.message}`);
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
