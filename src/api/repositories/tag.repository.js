import { PetOwnerTag, PetOwnerTagAssignment } from '../models/index.js';

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
      order: [['label', 'ASC']],
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

// Migrado do webhook N8n /tags na Fase 4. Aplica create + delete em batch
// na tabela M:M pet_owner_tag_assignments. Idempotente: re-create da mesma
// associação não duplica (constraint UNIQUE), e delete inexistente é no-op.
const manageAssignments = async ({ pet_owner_id, create = [], delete: toDelete = [] }) => {
  try {
    // Create — usa bulkCreate com ignoreDuplicates pra ser idempotente
    if (Array.isArray(create) && create.length > 0) {
      const rows = create.map((tag_id) => ({ pet_owner_id, tag_id }));
      await PetOwnerTagAssignment.bulkCreate(rows, { ignoreDuplicates: true });
    }

    // Delete — destroy WHERE pet_owner_id = X AND tag_id IN (...)
    if (Array.isArray(toDelete) && toDelete.length > 0) {
      await PetOwnerTagAssignment.destroy({
        where: { pet_owner_id, tag_id: toDelete },
      });
    }

    return { created: create.length, deleted: toDelete.length };
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
  manageAssignments,
};
