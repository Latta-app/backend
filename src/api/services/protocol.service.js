import ProtocolRepository from '../repositories/protocol.repository.js';

const createProtocol = async ({ protocolData }) => {
  try {
    return await ProtocolRepository.createProtocol({ protocolData });
  } catch (error) {
    throw new Error(`Error creating protocol: ${error.message}`);
  }
};

const getAllProtocols = async () => {
  try {
    return await ProtocolRepository.getAllProtocols();
  } catch (error) {
    throw new Error(`Error getting protocols: ${error.message}`);
  }
};

const getProtocolById = async ({ id }) => {
  try {
    const protocol = await ProtocolRepository.getProtocolById({ id });

    if (!protocol) {
      throw new Error('Protocol not found');
    }

    return protocol;
  } catch (error) {
    throw new Error(`Error getting protocol by id: ${error.message}`);
  }
};

const getProtocolsByClinic = async ({ clinicId }) => {
  try {
    const protocols = await ProtocolRepository.getProtocolsByClinic({ clinicId });
    return protocols;
  } catch (error) {
    throw new Error(`Error getting protocols by clinic: ${error.message}`);
  }
};

const getProtocolsByPetType = async ({ petTypeId }) => {
  try {
    const protocols = await ProtocolRepository.getProtocolsByPetType({ petTypeId });
    return protocols;
  } catch (error) {
    throw new Error(`Error getting protocols by pet type: ${error.message}`);
  }
};

const updateProtocol = async ({ id, protocolData }) => {
  try {
    return await ProtocolRepository.updateProtocol({ id, protocolData });
  } catch (error) {
    throw new Error(`Error updating protocol: ${error.message}`);
  }
};

const deleteProtocol = async ({ id }) => {
  try {
    return await ProtocolRepository.deleteProtocol({ id });
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