import ProtocolService from '../services/protocol.service.js';
import { validateProtocolCreate, validateProtocolUpdate } from '../validators/protocol.validations.js';

const createProtocol = async (req, res) => {
  try {
    const { error, value } = validateProtocolCreate(req.body);
    if (error) {
      return res.status(400).json({ 
        code: 'VALIDATION_ERROR',
        error: error.details 
      });
    }

    const newProtocol = await ProtocolService.createProtocol({ protocolData: value });

    return res.status(201).json({
      code: 'PROTOCOL_CREATED',
      data: newProtocol
    });
  } catch (error) {
    console.error('Error creating protocol:', error);
    return res.status(500).json({
      code: 'PROTOCOL_CREATION_ERROR',
      message: error.message
    });
  }
};

const getAllProtocols = async (_req, res) => {
  try {
    const protocols = await ProtocolService.getAllProtocols();
    return res.status(200).json({
      code: 'PROTOCOLS_FETCHED',
      data: protocols
    });
  } catch (error) {
    console.error('Error fetching protocols:', error);
    return res.status(500).json({
      code: 'FETCH_ERROR',
      message: error.message
    });
  }
};

const getProtocolById = async (req, res) => {
  try {
    const { id } = req.params;
    const protocol = await ProtocolService.getProtocolById({ id });

    return res.status(200).json({
      code: 'PROTOCOL_FETCHED',
      data: protocol
    });
  } catch (error) {
    console.error('Error fetching protocol:', error);
    if (error.message === 'Protocol not found') {
      return res.status(404).json({
        code: 'PROTOCOL_NOT_FOUND',
        message: 'Protocolo não encontrado'
      });
    }
    return res.status(500).json({
      code: 'FETCH_ERROR',
      message: error.message
    });
  }
};

const getProtocolsByClinic = async (req, res) => {
  try {
    const { clinicId } = req.params;
    const protocols = await ProtocolService.getProtocolsByClinic({ clinicId });

    return res.status(200).json({
      code: 'PROTOCOLS_FETCHED',
      data: protocols
    });
  } catch (error) {
    console.error('Error fetching protocols:', error);
    return res.status(500).json({
      code: 'FETCH_ERROR',
      message: error.message
    });
  }
};

const getProtocolsByPetType = async (req, res) => {
  try {
    const { petTypeId } = req.params;
    const protocols = await ProtocolService.getProtocolsByPetType({ petTypeId });

    return res.status(200).json({
      code: 'PROTOCOLS_FETCHED',
      data: protocols
    });
  } catch (error) {
    console.error('Error fetching protocols:', error);
    return res.status(500).json({
      code: 'FETCH_ERROR',
      message: error.message
    });
  }
};

const updateProtocol = async (req, res) => {
  try {
    const { id } = req.params;
    const { error, value } = validateProtocolUpdate(req.body);
    if (error) {
      return res.status(400).json({ 
        code: 'VALIDATION_ERROR',
        error: error.details 
      });
    }

    const updatedProtocol = await ProtocolService.updateProtocol({ id, protocolData: value });

    return res.status(200).json({
      code: 'PROTOCOL_UPDATED',
      data: updatedProtocol
    });
  } catch (error) {
    console.error('Error updating protocol:', error);
    if (error.message === 'Protocol not found') {
      return res.status(404).json({
        code: 'PROTOCOL_NOT_FOUND',
        message: 'Protocolo não encontrado'
      });
    }
    return res.status(500).json({
      code: 'UPDATE_ERROR',
      message: error.message
    });
  }
};

const deleteProtocol = async (req, res) => {
  try {
    const { id } = req.params;
    await ProtocolService.deleteProtocol({ id });

    return res.status(200).json({
      code: 'PROTOCOL_DELETED',
      message: 'Protocol deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting protocol:', error);
    if (error.message === 'Protocol not found') {
      return res.status(404).json({
        code: 'PROTOCOL_NOT_FOUND',
        message: 'Protocolo não encontrado'
      });
    }
    return res.status(500).json({
      code: 'DELETE_ERROR',
      message: error.message
    });
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