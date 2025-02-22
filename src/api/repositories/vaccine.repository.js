import { Vaccine, Pet, Protocol } from '../models/index.js';

const createVaccine = async ({ vaccineData }) => {
  try {
    const newVaccine = await Vaccine.create(vaccineData);

    if (!newVaccine) {
      throw new Error('Failed to create vaccine record');
    }

    return {
      id: newVaccine.id,
      pet_id: newVaccine.pet_id,
      protocol_id: newVaccine.protocol_id,
      name: newVaccine.name,
      date_administered: newVaccine.date_administered,
      next_due_date: newVaccine.next_due_date,
    };
  } catch (error) {
    throw new Error(`Repository error: ${error.message}`);
  }
};

const getAllVaccines = async () => {
  try {
    const vaccines = await Vaccine.findAll({
      include: [
        {
          model: Pet,
          as: 'pet',
          attributes: ['id', 'name', 'pet_owner_id'],
        },
        {
          model: Protocol,
          as: 'protocol',
          attributes: ['id', 'vaccine_name'],
        },
      ],
      attributes: ['id', 'name', 'date_administered', 'next_due_date', 'created_at'],
    });

    return vaccines;
  } catch (error) {
    throw new Error(`Error fetching vaccines: ${error.message}`);
  }
};

const getVaccineById = async ({ id }) => {
  try {
    const vaccine = await Vaccine.findOne({
      where: { id },
      include: [
        {
          model: Pet,
          as: 'pet',
          attributes: ['id', 'name', 'pet_owner_id'],
        },
        {
          model: Protocol,
          as: 'protocol',
          attributes: ['id', 'vaccine_name'],
        },
      ],
      attributes: ['id', 'name', 'date_administered', 'next_due_date', 'created_at'],
    });

    return vaccine;
  } catch (error) {
    throw new Error(`Error fetching vaccine by id: ${error.message}`);
  }
};

const getVaccinesByPetId = async ({ petId }) => {
  try {
    const vaccines = await Vaccine.findAll({
      where: { pet_id: petId },
      include: [
        {
          model: Pet,
          as: 'pet',
          attributes: ['id', 'name', 'pet_owner_id'],
        },
        {
          model: Protocol,
          as: 'protocol',
          attributes: ['id', 'vaccine_name'],
        },
      ],
      attributes: ['id', 'name', 'date_administered', 'next_due_date', 'created_at'],
    });

    return vaccines;
  } catch (error) {
    throw new Error(`Error fetching vaccines by pet id: ${error.message}`);
  }
};

const updateVaccine = async ({ id, vaccineData }) => {
  try {
    const [updated] = await Vaccine.update(vaccineData, {
      where: { id },
    });

    if (!updated) {
      throw new Error('Vaccine record not found');
    }

    const updatedVaccine = await getVaccineById({ id });
    return updatedVaccine;
  } catch (error) {
    throw new Error(`Error updating vaccine record: ${error.message}`);
  }
};

const deleteVaccine = async ({ id }) => {
  try {
    const deleted = await Vaccine.destroy({
      where: { id },
    });

    if (!deleted) {
      throw new Error('Vaccine record not found');
    }

    return true;
  } catch (error) {
    throw new Error(`Error deleting vaccine record: ${error.message}`);
  }
};

export default {
  createVaccine,
  getAllVaccines,
  getVaccineById,
  getVaccinesByPetId,
  updateVaccine,
  deleteVaccine,
};
