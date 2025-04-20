import { ServiceType } from '../models/index.js';

const createServiceType = async ({ serviceTypeData }) => {
  try {
    const newServiceType = await ServiceType.create(serviceTypeData);

    if (!newServiceType) {
      throw new Error('Failed to create service type');
    }

    return await getServiceTypeById({ id: newServiceType.id });
  } catch (error) {
    throw new Error(`Repository error: ${error.message}`);
  }
};

const getAllServiceTypes = async () => {
  try {
    const serviceTypes = await ServiceType.findAll({
      attributes: ['id', 'name', 'label', 'created_at', 'emoji', 'color'],
      order: [['label', 'ASC']],
    });

    return serviceTypes;
  } catch (error) {
    throw new Error(`Error fetching service types: ${error.message}`);
  }
};

const getServiceTypeById = async ({ id }) => {
  try {
    const serviceType = await ServiceType.findOne({
      where: { id },
      attributes: ['id', 'name', 'label', 'created_at', 'updated_at', 'emoji', 'color'],
    });

    if (!serviceType) {
      throw new Error('Service type not found');
    }

    return serviceType;
  } catch (error) {
    throw new Error(`Error fetching service type by id: ${error.message}`);
  }
};

const updateServiceType = async ({ id, serviceTypeData }) => {
  try {
    const allowedFields = ['name', 'label', 'emoji', 'color'];

    const sanitizedData = Object.keys(serviceTypeData)
      .filter((key) => allowedFields.includes(key) && serviceTypeData[key] !== undefined)
      .reduce(
        (obj, key) => ({
          ...obj,
          [key]: serviceTypeData[key],
        }),
        {},
      );

    const [updated] = await ServiceType.update(sanitizedData, {
      where: { id },
      returning: true,
    });

    if (!updated) {
      throw new Error('Service type not found');
    }

    const updatedServiceType = await getServiceTypeById({ id });
    return updatedServiceType;
  } catch (error) {
    throw new Error(`Error updating service type: ${error.message}`);
  }
};

const deleteServiceType = async ({ id }) => {
  try {
    const deleted = await ServiceType.destroy({
      where: { id },
    });

    if (!deleted) {
      throw new Error('Service type not found');
    }

    return true;
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
