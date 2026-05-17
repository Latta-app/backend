import SchedulingService from '../services/scheduling.service.js';
import MerchantSchedulingAgentService from '../services/merchant-scheduling-agent.service.js';
import { validateSchedulingUpdate } from '../validators/scheduling.validations.js';
import {
  redactAppointmentForClinic,
  redactAppointmentsForClinic,
} from '../utils/appointment-redactor.js';
import { logFromReq } from '../services/clinic-activity-log.service.js';

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
      logFromReq(req, 'view_appointment_detail', {
        appointment_id: scheduling.id,
        source: scheduling.source,
      });
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
    if (getRoleString(req) === 'petOwner' && scheduling.pet_owner_id !== req.user.id) {
      return res.status(403).json({
        code: 'FORBIDDEN',
        message: 'Você não tem permissão para cancelar este agendamento',
      });
    }
    if (isClinicRole(req)) {
      const jwtClinicId = getClinicId(req);
      if (!jwtClinicId || scheduling.clinic_id !== jwtClinicId) {
        return res.status(403).json({
          code: 'CLINIC_FORBIDDEN',
          message: 'Agendamento não pertence à sua clínica',
        });
      }
    }

    const reason = req.body?.reason || 'cancelado pela clinica via painel';

    // Latta (source=latta): chama EF merchant-scheduling-agent que dispara
    // template pro tutor + transita state. External (source=external): UPDATE
    // direto no banco, sem notificacao (tutor da clinica nao usa WhatsApp Latta).
    if (scheduling.source === 'latta') {
      await MerchantSchedulingAgentService.cancelByMerchant({ sessionId: id, reason });
    } else {
      await SchedulingService.cancelScheduling({ id, actor: actorOf(req) });
    }
    const canceled = await SchedulingService.getSchedulingById({ id });

    logFromReq(req, 'scheduling_cancelled', { appointment_id: id, source: scheduling.source });
    return res.status(200).json({
      code: 'SCHEDULING_CANCELED',
      data: isClinicRole(req) ? redactAppointmentForClinic(canceled) : canceled,
    });
  } catch (error) {
    return handleError(res, error, { action: 'canceling scheduling', code: 'CANCEL_ERROR' });
  }
};

const noShowScheduling = async (req, res) => {
  try {
    const { id } = req.params;
    const scheduling = await SchedulingService.getSchedulingById({ id });
    if (isClinicRole(req)) {
      const jwtClinicId = getClinicId(req);
      if (!jwtClinicId || scheduling.clinic_id !== jwtClinicId) {
        return res.status(403).json({
          code: 'CLINIC_FORBIDDEN',
          message: 'Agendamento não pertence à sua clínica',
        });
      }
    }

    const reason = req.body?.reason || 'tutor nao compareceu';

    if (scheduling.source === 'latta') {
      await MerchantSchedulingAgentService.noShowByMerchant({ sessionId: id, reason });
    } else {
      // External: UPDATE state direto no banco (NO_SHOW), sem template
      await SchedulingService.updateScheduling({ id, schedulingData: {} });
      await import('../../config/postgres.js').then(({ pgQuery }) =>
        pgQuery(
          `UPDATE scheduling_sessions SET state='NO_SHOW',
             state_history = COALESCE(state_history, '[]'::jsonb)
               || jsonb_build_array(jsonb_build_object('at', now(), 'state', 'NO_SHOW', 'source', $2::text, 'reason', $3::text)),
             updated_at = now()
           WHERE id = $1`,
          [id, actorOf(req), reason],
        ),
      );
    }
    const updated = await SchedulingService.getSchedulingById({ id });

    logFromReq(req, 'scheduling_no_show', { appointment_id: id, source: scheduling.source });
    return res.status(200).json({
      code: 'SCHEDULING_NO_SHOW',
      data: isClinicRole(req) ? redactAppointmentForClinic(updated) : updated,
    });
  } catch (error) {
    return handleError(res, error, { action: 'marking no-show', code: 'NO_SHOW_ERROR' });
  }
};

const rescheduleScheduling = async (req, res) => {
  try {
    const { id } = req.params;
    const { new_scheduled_date, new_scheduled_service, reason } = req.body || {};

    if (!new_scheduled_date) {
      return res.status(400).json({
        code: 'VALIDATION_ERROR',
        message: 'new_scheduled_date é obrigatório (ISO 8601)',
      });
    }

    const scheduling = await SchedulingService.getSchedulingById({ id });
    if (isClinicRole(req)) {
      const jwtClinicId = getClinicId(req);
      if (!jwtClinicId || scheduling.clinic_id !== jwtClinicId) {
        return res.status(403).json({
          code: 'CLINIC_FORBIDDEN',
          message: 'Agendamento não pertence à sua clínica',
        });
      }
    }

    if (scheduling.source === 'latta') {
      await MerchantSchedulingAgentService.rescheduleByMerchant({
        sessionId: id,
        newScheduledDate: new_scheduled_date,
        newScheduledService: new_scheduled_service,
        reason: reason || 'remarcado pela clinica via painel',
      });
    } else {
      await SchedulingService.updateScheduling({
        id,
        schedulingData: {
          scheduled_date: new_scheduled_date,
          ...(new_scheduled_service ? { scheduled_service: new_scheduled_service } : {}),
        },
      });
    }
    const updated = await SchedulingService.getSchedulingById({ id });

    logFromReq(req, 'scheduling_rescheduled', {
      appointment_id: id,
      source: scheduling.source,
      new_date: new_scheduled_date,
    });
    return res.status(200).json({
      code: 'SCHEDULING_RESCHEDULED',
      data: isClinicRole(req) ? redactAppointmentForClinic(updated) : updated,
    });
  } catch (error) {
    return handleError(res, error, { action: 'rescheduling', code: 'RESCHEDULE_ERROR' });
  }
};

const confirmScheduling = async (req, res) => {
  try {
    const { id } = req.params;
    const confirmed = await SchedulingService.confirmScheduling({ id, actor: actorOf(req) });
    logFromReq(req, 'scheduling_confirmed', { appointment_id: id });
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
  noShowScheduling,
  rescheduleScheduling,
  confirmScheduling,
  deleteScheduling,
};
