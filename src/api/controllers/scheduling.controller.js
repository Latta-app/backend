import SchedulingService from '../services/scheduling.service.js';
import { validateSchedulingUpdate } from '../validators/scheduling.validations.js';
import {
  redactAppointmentForClinic,
  redactAppointmentsForClinic,
} from '../utils/appointment-redactor.js';

const getRoleString = (req) => {
  const raw = req?.user?.role;
  if (typeof raw === 'string') return raw;
  return raw?.role || raw?.name || null;
};

const getClinicId = (req) =>
  req?.user?.clinic_id || req?.user?.role?.clinic_id || null;

const isClinicRole = (req) => getRoleString(req) === 'clinic';

const actorOf = (req) => {
  if (!req?.user) return 'backend_admin';
  return req.user.email || req.user.id || 'backend_admin';
};

const handleError = (res, error, fallback) => {
  console.error(`Error ${fallback.action}:`, error);
  if (error.code === 'NOT_FOUND' || /not found/i.test(error.message)) {
    return res.status(404).json({
      code: 'SCHEDULING_NOT_FOUND',
      message: 'Agendamento não encontrado',
    });
  }
  if (error.code === 'FORBIDDEN') {
    return res.status(403).json({
      code: 'SCHEDULING_FORBIDDEN',
      message: error.message,
    });
  }
  return res.status(500).json({
    code: fallback.code,
    message: error.message,
  });
};

const createScheduling = async (req, res) => {
  try {
    const body = Array.isArray(req.body) ? req.body : [req.body];
    const created = await SchedulingService.createScheduling({ schedulingData: body });
    return res.status(201).json({
      code: 'SCHEDULING_CREATED',
      data: created,
    });
  } catch (error) {
    return handleError(res, error, {
      action: 'creating scheduling',
      code: 'SCHEDULING_CREATION_ERROR',
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
    return handleError(res, error, { action: 'fetching schedulings', code: 'FETCH_ERROR' });
  }
};

const getSchedulingsByClinic = async (req, res) => {
  try {
    const { clinicId } = req.params;
    const { date, status } = req.query;

    // Anti-bypass: role clinic so vê própria clínica, ignora URL diferente
    if (isClinicRole(req)) {
      const jwtClinicId = getClinicId(req);
      if (!jwtClinicId) {
        return res.status(403).json({
          code: 'CLINIC_FORBIDDEN',
          message: 'JWT sem clinic_id',
        });
      }
      if (jwtClinicId !== clinicId) {
        return res.status(403).json({
          code: 'CLINIC_FORBIDDEN',
          message: 'Acesso a agendamentos de outra clínica não permitido',
        });
      }
    }

    const schedulings = await SchedulingService.getSchedulingsByClinic({
      clinicId,
      date,
      status,
    });

    const payload = isClinicRole(req)
      ? redactAppointmentsForClinic(schedulings)
      : schedulings;

    return res.status(200).json({
      code: 'CLINIC_SCHEDULINGS_FETCHED',
      data: payload,
    });
  } catch (error) {
    return handleError(res, error, {
      action: 'fetching clinic schedulings',
      code: 'FETCH_ERROR',
    });
  }
};

const getSchedulingsByPetOwner = async (req, res) => {
  try {
    const { petOwnerId } = req.params;
    const { date, status } = req.query;

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
    return handleError(res, error, {
      action: 'fetching pet owner schedulings',
      code: 'FETCH_ERROR',
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
    return handleError(res, error, { action: 'fetching pet schedulings', code: 'FETCH_ERROR' });
  }
};

const getSchedulingById = async (req, res) => {
  try {
    const { id } = req.params;
    const scheduling = await SchedulingService.getSchedulingById({ id });

    if (getRoleString(req) === 'petOwner' && scheduling.pet_owner_id !== req.user.id) {
      return res.status(403).json({
        code: 'FORBIDDEN',
        message: 'Você não tem permissão para acessar este agendamento',
      });
    }

    // Role clinic: só vê própria clinic + payload redacted
    if (isClinicRole(req)) {
      const jwtClinicId = getClinicId(req);
      if (!jwtClinicId || scheduling.clinic_id !== jwtClinicId) {
        return res.status(403).json({
          code: 'CLINIC_FORBIDDEN',
          message: 'Agendamento não pertence à sua clínica',
        });
      }
      return res.status(200).json({
        code: 'SCHEDULING_FETCHED',
        data: redactAppointmentForClinic(scheduling),
      });
    }

    return res.status(200).json({
      code: 'SCHEDULING_FETCHED',
      data: scheduling,
    });
  } catch (error) {
    return handleError(res, error, { action: 'fetching scheduling', code: 'FETCH_ERROR' });
  }
};

const updateScheduling = async (req, res) => {
  try {
    const { id } = req.params;
    const { error, value } = validateSchedulingUpdate(req.body);
    if (error) {
      return res.status(400).json({ code: 'VALIDATION_ERROR', error: error.details });
    }
    const updated = await SchedulingService.updateScheduling({ id, schedulingData: value });
    return res.status(200).json({
      code: 'SCHEDULING_UPDATED',
      data: updated,
    });
  } catch (error) {
    return handleError(res, error, { action: 'updating scheduling', code: 'UPDATE_ERROR' });
  }
};

const cancelScheduling = async (req, res) => {
  try {
    const { id } = req.params;
    const scheduling = await SchedulingService.getSchedulingById({ id });
    if (req.user.role === 'petOwner' && scheduling.pet_owner_id !== req.user.id) {
      return res.status(403).json({
        code: 'FORBIDDEN',
        message: 'Você não tem permissão para cancelar este agendamento',
      });
    }
    const canceled = await SchedulingService.cancelScheduling({ id, actor: actorOf(req) });
    return res.status(200).json({
      code: 'SCHEDULING_CANCELED',
      data: canceled,
    });
  } catch (error) {
    return handleError(res, error, { action: 'canceling scheduling', code: 'CANCEL_ERROR' });
  }
};

const confirmScheduling = async (req, res) => {
  try {
    const { id } = req.params;
    const confirmed = await SchedulingService.confirmScheduling({ id, actor: actorOf(req) });
    return res.status(200).json({
      code: 'SCHEDULING_CONFIRMED',
      data: confirmed,
    });
  } catch (error) {
    return handleError(res, error, { action: 'confirming scheduling', code: 'CONFIRM_ERROR' });
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
    return handleError(res, error, { action: 'deleting scheduling', code: 'DELETE_ERROR' });
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
