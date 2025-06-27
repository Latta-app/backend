import SchedulingService from '../services/scheduling.service.js';
import { validateSchedulingUpdate } from '../validators/scheduling.validations.js';

const createScheduling = async (req, res) => {
  try {
    const newScheduling = await SchedulingService.createScheduling({ schedulingData: req.body });

    return res.status(201).json({
      code: 'SCHEDULING_CREATED',
      data: newScheduling,
    });
  } catch (error) {
    console.error('Error creating scheduling:', error);
    return res.status(500).json({
      code: 'SCHEDULING_CREATION_ERROR',
      message: error.message,
    });
  }
};

const getAllSchedulings = async (req, res) => {
  try {
    const { date, status } = req.query;
    const schedulings = await SchedulingService.getAllSchedulings({ date, status });

    return res.status(200).json({
      code: 'SCHEDULINGS_FETCHED',
      data: schedulings,
    });
  } catch (error) {
    console.error('Error fetching schedulings:', error);
    return res.status(500).json({
      code: 'FETCH_ERROR',
      message: error.message,
    });
  }
};

const getSchedulingsByClinic = async (req, res) => {
  try {
    const { clinicId } = req.params;
    const { date, status } = req.query;

    const schedulings = await SchedulingService.getSchedulingsByClinic({
      clinicId,
      date,
      status,
    });

    return res.status(200).json({
      code: 'CLINIC_SCHEDULINGS_FETCHED',
      data: schedulings,
    });
  } catch (error) {
    console.error('Error fetching clinic schedulings:', error);
    return res.status(500).json({
      code: 'FETCH_ERROR',
      message: error.message,
    });
  }
};

const getSchedulingsByPetOwner = async (req, res) => {
  try {
    const { petOwnerId } = req.params;
    const { date, status } = req.query;

    // Verificar se o usuário é dono do pet ou admin
    if (req.user.role === 'petOwner' && req.user.id !== petOwnerId) {
      return res.status(403).json({
        code: 'FORBIDDEN',
        message: 'Você não tem permissão para acessar agendamentos de outros donos de pets',
      });
    }

    const schedulings = await SchedulingService.getSchedulingsByPetOwner({
      petOwnerId,
      date,
      status,
    });

    return res.status(200).json({
      code: 'PET_OWNER_SCHEDULINGS_FETCHED',
      data: schedulings,
    });
  } catch (error) {
    console.error('Error fetching pet owner schedulings:', error);
    return res.status(500).json({
      code: 'FETCH_ERROR',
      message: error.message,
    });
  }
};

const getSchedulingsByPet = async (req, res) => {
  try {
    const { petId } = req.params;
    const { date, status } = req.query;

    const schedulings = await SchedulingService.getSchedulingsByPet({
      petId,
      date,
      status,
    });

    // Verificar se o usuário é dono do pet (verificação feita no service)
    if (
      req.user.role === 'petOwner' &&
      schedulings.length > 0 &&
      schedulings[0].pet_owner_id !== req.user.id
    ) {
      return res.status(403).json({
        code: 'FORBIDDEN',
        message: 'Você não tem permissão para acessar agendamentos de pets que não são seus',
      });
    }

    return res.status(200).json({
      code: 'PET_SCHEDULINGS_FETCHED',
      data: schedulings,
    });
  } catch (error) {
    console.error('Error fetching pet schedulings:', error);
    return res.status(500).json({
      code: 'FETCH_ERROR',
      message: error.message,
    });
  }
};

const getSchedulingById = async (req, res) => {
  try {
    const { id } = req.params;
    const scheduling = await SchedulingService.getSchedulingById({ id });

    // Verificar se o usuário é dono do pet ou admin
    if (req.user.role === 'petOwner' && scheduling.pet_owner_id !== req.user.id) {
      return res.status(403).json({
        code: 'FORBIDDEN',
        message: 'Você não tem permissão para acessar este agendamento',
      });
    }

    return res.status(200).json({
      code: 'SCHEDULING_FETCHED',
      data: scheduling,
    });
  } catch (error) {
    console.error('Error fetching scheduling:', error);
    if (error.message.includes('not found')) {
      return res.status(404).json({
        code: 'SCHEDULING_NOT_FOUND',
        message: 'Agendamento não encontrado',
      });
    }
    return res.status(500).json({
      code: 'FETCH_ERROR',
      message: error.message,
    });
  }
};

const updateScheduling = async (req, res) => {
  try {
    const { id } = req.params;

    const { error, value } = validateSchedulingUpdate(req.body);
    if (error) {
      return res.status(400).json({
        code: 'VALIDATION_ERROR',
        error: error.details,
      });
    }

    const updatedScheduling = await SchedulingService.updateScheduling({
      id,
      schedulingData: value,
    });

    return res.status(200).json({
      code: 'SCHEDULING_UPDATED',
      data: updatedScheduling,
    });
  } catch (error) {
    console.error('Error updating scheduling:', error);
    if (error.message.includes('not found')) {
      return res.status(404).json({
        code: 'SCHEDULING_NOT_FOUND',
        message: 'Agendamento não encontrado',
      });
    }
    return res.status(500).json({
      code: 'UPDATE_ERROR',
      message: error.message,
    });
  }
};

const cancelScheduling = async (req, res) => {
  try {
    const { id } = req.params;

    const scheduling = await SchedulingService.getSchedulingById({ id });

    // Verificar se o usuário é dono do pet ou admin
    if (req.user.role === 'petOwner' && scheduling.pet_owner_id !== req.user.id) {
      return res.status(403).json({
        code: 'FORBIDDEN',
        message: 'Você não tem permissão para cancelar este agendamento',
      });
    }

    const canceledScheduling = await SchedulingService.cancelScheduling({ id });

    return res.status(200).json({
      code: 'SCHEDULING_CANCELED',
      data: canceledScheduling,
    });
  } catch (error) {
    console.error('Error canceling scheduling:', error);
    if (error.message.includes('not found')) {
      return res.status(404).json({
        code: 'SCHEDULING_NOT_FOUND',
        message: 'Agendamento não encontrado',
      });
    }
    return res.status(500).json({
      code: 'CANCEL_ERROR',
      message: error.message,
    });
  }
};

const confirmScheduling = async (req, res) => {
  try {
    const { id } = req.params;

    const confirmedScheduling = await SchedulingService.confirmScheduling({ id });

    return res.status(200).json({
      code: 'SCHEDULING_CONFIRMED',
      data: confirmedScheduling,
    });
  } catch (error) {
    console.error('Error confirming scheduling:', error);
    if (error.message.includes('not found')) {
      return res.status(404).json({
        code: 'SCHEDULING_NOT_FOUND',
        message: 'Agendamento não encontrado',
      });
    }
    return res.status(500).json({
      code: 'CONFIRM_ERROR',
      message: error.message,
    });
  }
};

const deleteScheduling = async (req, res) => {
  try {
    const { id } = req.params;
    await SchedulingService.deleteScheduling({ id });

    return res.status(200).json({
      code: 'SCHEDULING_DELETED',
      message: 'Agendamento excluído com sucesso',
    });
  } catch (error) {
    console.error('Error deleting scheduling:', error);
    if (error.message.includes('not found')) {
      return res.status(404).json({
        code: 'SCHEDULING_NOT_FOUND',
        message: 'Agendamento não encontrado',
      });
    }
    return res.status(500).json({
      code: 'DELETE_ERROR',
      message: error.message,
    });
  }
};

export default {
  createScheduling,
  getAllSchedulings,
  getSchedulingsByClinic,
  getSchedulingsByPetOwner,
  getSchedulingsByPet,
  getSchedulingById,
  updateScheduling,
  cancelScheduling,
  confirmScheduling,
  deleteScheduling,
};
