import VaccineService from '../services/vaccine.service.js';
import { validateVaccineCreate, validateVaccineUpdate } from '../validators/vaccine.validations.js';

const createVaccine = async (req, res) => {
  try {
    const { error, value } = validateVaccineCreate(req.body);
    if (error) {
      return res.status(400).json({ 
        code: 'VALIDATION_ERROR',
        error: error.details 
      });
    }

    const newVaccine = await VaccineService.createVaccine({ vaccineData: value });

    return res.status(201).json({
      code: 'VACCINE_CREATED',
      data: newVaccine
    });
  } catch (error) {
    console.error('Error creating vaccine record:', error);
    return res.status(500).json({
      code: 'VACCINE_CREATION_ERROR',
      message: error.message
    });
  }
};

const getAllVaccines = async (_req, res) => {
  try {
    const vaccines = await VaccineService.getAllVaccines();
    return res.status(200).json({
      code: 'VACCINES_FETCHED',
      data: vaccines
    });
  } catch (error) {
    console.error('Error fetching vaccines:', error);
    return res.status(500).json({
      code: 'FETCH_ERROR',
      message: error.message
    });
  }
};

const getVaccineById = async (req, res) => {
  try {
    const { id } = req.params;
    const vaccine = await VaccineService.getVaccineById({ id });

    return res.status(200).json({
      code: 'VACCINE_FETCHED',
      data: vaccine
    });
  } catch (error) {
    console.error('Error fetching vaccine:', error);
    if (error.message === 'Vaccine record not found') {
      return res.status(404).json({
        code: 'VACCINE_NOT_FOUND',
        message: 'Registro de vacina não encontrado'
      });
    }
    return res.status(500).json({
      code: 'FETCH_ERROR',
      message: error.message
    });
  }
};

const getVaccinesByPetId = async (req, res) => {
  try {
    const { petId } = req.params;
    const vaccines = await VaccineService.getVaccinesByPetId({ petId });

    return res.status(200).json({
      code: 'VACCINES_FETCHED',
      data: vaccines
    });
  } catch (error) {
    console.error('Error fetching vaccines:', error);
    return res.status(500).json({
      code: 'FETCH_ERROR',
      message: error.message
    });
  }
};

const updateVaccine = async (req, res) => {
  try {
    const { id } = req.params;
    const { error, value } = validateVaccineUpdate(req.body);
    if (error) {
      return res.status(400).json({ 
        code: 'VALIDATION_ERROR',
        error: error.details 
      });
    }

    const updatedVaccine = await VaccineService.updateVaccine({ id, vaccineData: value });

    return res.status(200).json({
      code: 'VACCINE_UPDATED',
      data: updatedVaccine
    });
  } catch (error) {
    console.error('Error updating vaccine:', error);
    if (error.message === 'Vaccine record not found') {
      return res.status(404).json({
        code: 'VACCINE_NOT_FOUND',
        message: 'Registro de vacina não encontrado'
      });
    }
    return res.status(500).json({
      code: 'UPDATE_ERROR',
      message: error.message
    });
  }
};

const deleteVaccine = async (req, res) => {
  try {
    const { id } = req.params;
    await VaccineService.deleteVaccine({ id });

    return res.status(200).json({
      code: 'VACCINE_DELETED',
      message: 'Vaccine record deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting vaccine:', error);
    if (error.message === 'Vaccine record not found') {
      return res.status(404).json({
        code: 'VACCINE_NOT_FOUND',
        message: 'Registro de vacina não encontrado'
      });
    }
    return res.status(500).json({
      code: 'DELETE_ERROR',
      message: error.message
    });
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