import { PetOwnerTag } from '../models/index.js';

const getAllTags = async ({ clinic_id, page = 1, limit = 15 }) => {
  try {
    const offset = (page - 1) * limit;

    const { count: totalItems, rows: tags } = await PetOwnerTag.findAndCountAll({
      where: {
        clinic_id,
        is_active: true,
      },
      attributes: { exclude: ['is_active', 'created_at', 'updated_at'] },
      // limit,
      // offset,
      order: [['created_at', 'DESC']],
    });

    return {
      tags,
      totalItems,
    };
  } catch (error) {
    throw new Error(`Repository error: ${error.message}`);
  }
};

const getTagById = async ({ id, clinic_id }) => {
  try {
    const tag = await PetOwnerTag.findOne({
      where: {
        id,
        clinic_id,
      },
    });

    return tag;
  } catch (error) {
    throw new Error(`Repository error: ${error.message}`);
  }
};

const createTag = async ({ tagData, clinic_id }) => {
  try {
    const tag = await PetOwnerTag.create({
      ...tagData,
      clinic_id,
    });

    return tag;
  } catch (error) {
    throw new Error(`Repository error: ${error.message}`);
  }
};

const updateTag = async ({ id, tagData, clinic_id }) => {
  try {
    const [updatedRows] = await PetOwnerTag.update(tagData, {
      where: {
        id,
        clinic_id,
      },
    });

    if (updatedRows === 0) {
      return null;
    }

    const updatedTag = await PetOwnerTag.findOne({
      where: {
        id,
        clinic_id,
      },
    });

    return updatedTag;
  } catch (error) {
    throw new Error(`Repository error: ${error.message}`);
  }
};

const deleteTag = async ({ id, clinic_id }) => {
  try {
    const deletedRows = await PetOwnerTag.destroy({
      where: {
        id,
        clinic_id,
      },
    });

    return deletedRows > 0;
  } catch (error) {
    throw new Error(`Repository error: ${error.message}`);
  }
};

const searchTags = async ({ clinic_id, name, page = 1, limit = 15 }) => {
  try {
    const { Op } = require('sequelize');
    const offset = (page - 1) * limit;

    const whereConditions = {
      clinic_id,
    };

    if (name) {
      whereConditions.name = { [Op.iLike]: `%${name}%` };
    }

    const { count: totalItems, rows: tags } = await PetOwnerTag.findAndCountAll({
      where: whereConditions,
      limit,
      offset,
      order: [['created_at', 'DESC']],
    });

    return {
      tags,
      totalItems,
    };
  } catch (error) {
    throw new Error(`Repository error: ${error.message}`);
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
