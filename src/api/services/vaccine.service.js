import VaccineRepository from '../repositories/vaccine.repository.js';

const createVaccine = async ({ vaccineData }) => {
  try {
    return await VaccineRepository.createVaccine({ vaccineData });
  } catch (error) {
    throw new Error(`Error creating vaccine record: ${error.message}`);
  }
};

const getAllVaccines = async () => {
  try {
    return await VaccineRepository.getAllVaccines();
  } catch (error) {
    throw new Error(`Error getting vaccines: ${error.message}`);
  }
};

const getVaccineById = async ({ id }) => {
  try {
    const vaccine = await VaccineRepository.getVaccineById({ id });

    if (!vaccine) {
      throw new Error('Vaccine record not found');
    }

    return vaccine;
  } catch (error) {
    throw new Error(`Error getting vaccine by id: ${error.message}`);
  }
};

const getVaccinesByPetId = async ({ petId }) => {
  try {
    const vaccines = await VaccineRepository.getVaccinesByPetId({ petId });
    return vaccines;
  } catch (error) {
    throw new Error(`Error getting vaccines by pet id: ${error.message}`);
  }
};

const updateVaccine = async ({ id, vaccineData }) => {
  try {
    return await VaccineRepository.updateVaccine({ id, vaccineData });
  } catch (error) {
    throw new Error(`Error updating vaccine record: ${error.message}`);
  }
};

const deleteVaccine = async ({ id }) => {
  try {
    return await VaccineRepository.deleteVaccine({ id });
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
  deleteVaccine
};