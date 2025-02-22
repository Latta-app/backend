import { Protocol, Clinic, PetType } from '../models/index.js';

const createProtocol = async ({ protocolData }) => {
  try {
    const newProtocol = await Protocol.create(protocolData);
    
    if (!newProtocol) {
      throw new Error('Failed to create protocol');
    } 

    return {
      id: newProtocol.id,
      clinic_id: newProtocol.clinic_id,
      pet_type_id: newProtocol.pet_type_id,
      vaccine_name: newProtocol.vaccine_name,
      initial_dose_age: newProtocol.initial_dose_age,
      booster_frequency: newProtocol.booster_frequency
    };
  } catch (error) {
    throw new Error(`Repository error: ${error.message}`);
  }
};

const getAllProtocols = async () => {
  try {
    const protocols = await Protocol.findAll({
      include: [
        {
          model: Clinic,
          as: 'clinic',
          attributes: ['id', 'name']
        },
        {
          model: PetType,
          as: 'petType',
          attributes: ['id', 'name', 'label']
        }
      ],
      attributes: [
        'id', 
        'vaccine_name', 
        'initial_dose_age', 
        'booster_frequency', 
        'created_at'
      ],
    });

    return protocols;
  } catch (error) {
    throw new Error(`Error fetching protocols: ${error.message}`);
  }
};

const getProtocolById = async ({ id }) => {
  try {
    const protocol = await Protocol.findOne({
      where: { id },
      include: [
        {
          model: Clinic,
          as: 'clinic',
          attributes: ['id', 'name']
        },
        {
          model: PetType,
          as: 'petType',
          attributes: ['id', 'name']
        }
      ],
      attributes: [
        'id', 
        'vaccine_name', 
        'initial_dose_age', 
        'booster_frequency', 
        'created_at'
      ]
    });

    return protocol;
  } catch (error) {
    throw new Error(`Error fetching protocol by id: ${error.message}`);
  }
};

const getProtocolsByClinic = async ({ clinicId }) => {
  try {
    const protocols = await Protocol.findAll({
      where: { clinic_id: clinicId },
      include: [
        {
          model: Clinic,
          as: 'clinic',
          attributes: ['id', 'name']
        },
        {
          model: PetType,
          as: 'petType',
          attributes: ['id', 'name']
        }
      ],
      attributes: [
        'id', 
        'vaccine_name', 
        'initial_dose_age', 
        'booster_frequency', 
        'created_at'
      ]
    });

    return protocols;
  } catch (error) {
    throw new Error(`Error fetching protocols by clinic: ${error.message}`);
  }
};

const getProtocolsByPetType = async ({ petTypeId }) => {
  try {
    const protocols = await Protocol.findAll({
      where: { pet_type_id: petTypeId },
      include: [
        {
          model: Clinic,
          as: 'clinic',
          attributes: ['id', 'name']
        },
        {
          model: PetType,
          as: 'petType',
          attributes: ['id', 'name']
        }
      ],
      attributes: [
        'id', 
        'vaccine_name', 
        'initial_dose_age', 
        'booster_frequency', 
        'created_at'
      ]
    });

    return protocols;
  } catch (error) {
    throw new Error(`Error fetching protocols by pet type: ${error.message}`);
  }
};

const updateProtocol = async ({ id, protocolData }) => {
  try {
    const [updated] = await Protocol.update(protocolData, {
      where: { id }
    });

    if (!updated) {
      throw new Error('Protocol not found');
    }

    const updatedProtocol = await getProtocolById({ id });
    return updatedProtocol;
  } catch (error) {
    throw new Error(`Error updating protocol: ${error.message}`);
  }
};

const deleteProtocol = async ({ id }) => {
  try {
    const deleted = await Protocol.destroy({
      where: { id }
    });

    if (!deleted) {
      throw new Error('Protocol not found');
    }

    return true;
  } catch (error) {
    throw new Error(`Error deleting protocol: ${error.message}`);
  }
};

export default {
  createProtocol,
  getAllProtocols,
  getProtocolById,
  getProtocolsByClinic,
  getProtocolsByPetType,
  updateProtocol,
  deleteProtocol
};