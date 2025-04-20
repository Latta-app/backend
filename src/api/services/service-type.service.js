import ServiceTypeRepository from '../repositories/service-type.repository.js';

const createServiceType = async ({ serviceTypeData }) => {
  try {
    return await ServiceTypeRepository.createServiceType({ serviceTypeData });
  } catch (error) {
    throw new Error(`Error creating service type: ${error.message}`);
  }
};

const getAllServiceTypes = async () => {
  try {
    return await ServiceTypeRepository.getAllServiceTypes();
  } catch (error) {
    throw new Error(`Error getting service types: ${error.message}`);
  }
};

const getServiceTypeById = async ({ id }) => {
  try {
    const serviceType = await ServiceTypeRepository.getServiceTypeById({ id });

    if (!serviceType) {
      throw new Error('Service type not found');
    }

    return serviceType;
  } catch (error) {
    throw new Error(`Error getting service type by id: ${error.message}`);
  }
};

const updateServiceType = async ({ id, serviceTypeData }) => {
  try {
    return await ServiceTypeRepository.updateServiceType({ id, serviceTypeData });
  } catch (error) {
    throw new Error(`Error updating service type: ${error.message}`);
  }
};

const deleteServiceType = async ({ id }) => {
  try {
    return await ServiceTypeRepository.deleteServiceType({ id });
  } catch (error) {
    throw new Error(`Error deleting service type: ${error.message}`);
  }
};

export default {
  createServiceType,
  getAllServiceTypes,
  getServiceTypeById,
  updateServiceType,
  deleteServiceType,
};
