import SchedulingRepository from '../repositories/scheduling.repository.js';

const createScheduling = async ({ schedulingData }) => {
  try {
    const data = { ...schedulingData };

    delete data.frequency;
    delete data.endCondition;

    const newScheduling = await SchedulingRepository.createScheduling({
      schedulingData: data,
    });

    if (!newScheduling) {
      throw new Error('Failed to create scheduling');
    }

    return await getSchedulingById({ id: newScheduling.id });
  } catch (error) {
    throw new Error(`Service error: ${error.message}`);
  }
};

const getAllSchedulings = async ({ date, status }) => {
  try {
    return await SchedulingRepository.getAllSchedulings({ date, status });
  } catch (error) {
    throw new Error(`Error getting schedulings: ${error.message}`);
  }
};

const getSchedulingsByClinic = async ({ clinicId, date, status }) => {
  try {
    return await SchedulingRepository.getSchedulingsByClinic({ clinicId, date, status });
  } catch (error) {
    throw new Error(`Error getting schedulings by clinic: ${error.message}`);
  }
};

const getSchedulingsByPetOwner = async ({ petOwnerId, date, status }) => {
  try {
    return await SchedulingRepository.getSchedulingsByPetOwner({ petOwnerId, date, status });
  } catch (error) {
    throw new Error(`Error getting schedulings by pet owner: ${error.message}`);
  }
};

const getSchedulingsByPet = async ({ petId, date, status }) => {
  try {
    return await SchedulingRepository.getSchedulingsByPet({ petId, date, status });
  } catch (error) {
    throw new Error(`Error getting schedulings by pet: ${error.message}`);
  }
};

const getSchedulingById = async ({ id }) => {
  try {
    const scheduling = await SchedulingRepository.getSchedulingById({ id });

    if (!scheduling) {
      throw new Error('Scheduling not found');
    }

    return scheduling;
  } catch (error) {
    throw new Error(`Error getting scheduling by id: ${error.message}`);
  }
};

const updateScheduling = async ({ id, schedulingData }) => {
  try {
    return await SchedulingRepository.updateScheduling({ id, schedulingData });
  } catch (error) {
    throw new Error(`Error updating scheduling: ${error.message}`);
  }
};

const cancelScheduling = async ({ id }) => {
  try {
    // Supondo que há um ID de status para "cancelado"
    const CANCELED_STATUS_ID = 'ID_DO_STATUS_CANCELADO';

    return await SchedulingRepository.updateScheduling({
      id,
      schedulingData: {
        scheduling_status_id: CANCELED_STATUS_ID,
      },
    });
  } catch (error) {
    throw new Error(`Error canceling scheduling: ${error.message}`);
  }
};

const confirmScheduling = async ({ id }) => {
  try {
    return await SchedulingRepository.updateScheduling({
      id,
      schedulingData: {
        is_confirmed: true,
      },
    });
  } catch (error) {
    throw new Error(`Error confirming scheduling: ${error.message}`);
  }
};

const deleteScheduling = async ({ id }) => {
  try {
    return await SchedulingRepository.deleteScheduling({ id });
  } catch (error) {
    throw new Error(`Error deleting scheduling: ${error.message}`);
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
