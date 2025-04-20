import ServiceTypeService from '../services/service-type.service.js';
import {
  validateServiceTypeCreate,
  validateServiceTypeUpdate,
} from '../validators/service-type.validations.js';

const createServiceType = async (req, res) => {
  try {
    const { error, value } = validateServiceTypeCreate(req.body);
    if (error) {
      return res.status(400).json({
        code: 'VALIDATION_ERROR',
        error: error.details,
      });
    }

    const newServiceType = await ServiceTypeService.createServiceType({ serviceTypeData: value });

    return res.status(201).json({
      code: 'SERVICE_TYPE_CREATED',
      data: newServiceType,
    });
  } catch (error) {
    console.error('Error creating service type:', error);
    return res.status(500).json({
      code: 'SERVICE_TYPE_CREATION_ERROR',
      message: error.message,
    });
  }
};

const getAllServiceTypes = async (_req, res) => {
  try {
    const serviceTypes = await ServiceTypeService.getAllServiceTypes();
    return res.status(200).json({
      code: 'SERVICE_TYPES_FETCHED',
      data: serviceTypes,
    });
  } catch (error) {
    console.error('Error fetching service types:', error);
    return res.status(500).json({
      code: 'FETCH_ERROR',
      message: error.message,
    });
  }
};

const getServiceTypeById = async (req, res) => {
  try {
    const { id } = req.params;
    const serviceType = await ServiceTypeService.getServiceTypeById({ id });

    return res.status(200).json({
      code: 'SERVICE_TYPE_FETCHED',
      data: serviceType,
    });
  } catch (error) {
    console.error('Error fetching service type:', error);
    if (error.message.includes('not found')) {
      return res.status(404).json({
        code: 'SERVICE_TYPE_NOT_FOUND',
        message: 'Tipo de serviço não encontrado',
      });
    }
    return res.status(500).json({
      code: 'FETCH_ERROR',
      message: error.message,
    });
  }
};

const updateServiceType = async (req, res) => {
  try {
    const { id } = req.params;

    const { error, value } = validateServiceTypeUpdate(req.body);
    if (error) {
      return res.status(400).json({
        code: 'VALIDATION_ERROR',
        error: error.details,
      });
    }

    const updatedServiceType = await ServiceTypeService.updateServiceType({
      id,
      serviceTypeData: value,
    });

    return res.status(200).json({
      code: 'SERVICE_TYPE_UPDATED',
      data: updatedServiceType,
    });
  } catch (error) {
    console.error('Error updating service type:', error);
    if (error.message.includes('not found')) {
      return res.status(404).json({
        code: 'SERVICE_TYPE_NOT_FOUND',
        message: 'Tipo de serviço não encontrado',
      });
    }
    return res.status(500).json({
      code: 'UPDATE_ERROR',
      message: error.message,
    });
  }
};

const deleteServiceType = async (req, res) => {
  try {
    const { id } = req.params;
    await ServiceTypeService.deleteServiceType({ id });

    return res.status(200).json({
      code: 'SERVICE_TYPE_DELETED',
      message: 'Tipo de serviço excluído com sucesso',
    });
  } catch (error) {
    console.error('Error deleting service type:', error);
    if (error.message.includes('not found')) {
      return res.status(404).json({
        code: 'SERVICE_TYPE_NOT_FOUND',
        message: 'Tipo de serviço não encontrado',
      });
    }
    return res.status(500).json({
      code: 'DELETE_ERROR',
      message: error.message,
    });
  }
};

export default {
  createServiceType,
  getAllServiceTypes,
  getServiceTypeById,
  updateServiceType,
  deleteServiceType,
};
