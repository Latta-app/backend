import { DateTime } from 'luxon';
import SchedulingRepository from '../repositories/scheduling.repository.js';
import ClinicExternalRepository from '../repositories/clinic-external.repository.js';
import { pgPool } from '../../config/postgres.js';

const MAX_RECURRENT_SCHEDULINGS = 50;
const TOTAL_LIMIT = 50;

const generateRecurrentSchedulings = (scheduling) => {
  if (!scheduling.frequency || scheduling.frequency.type === 'no_repeat') {
    return [scheduling];
  }

  const { frequency, endCondition } = scheduling;
  const baseDate = DateTime.fromISO(scheduling.appointment_date);
  const baseStartTime = DateTime.fromSQL(scheduling.start_time);
  const baseEndTime = scheduling.end_time ? DateTime.fromSQL(scheduling.end_time) : baseStartTime;

  let endDate = baseDate;
  if (endCondition?.type === 'after') {
    if (endCondition.interval?.value === 'weeks') {
      endDate = baseDate.plus({ weeks: endCondition.value });
    } else if (endCondition.interval?.value === 'months') {
      endDate = baseDate.plus({ months: endCondition.value });
    } else {
      endDate = baseDate.plus({ days: endCondition.value });
    }
  } else if (endCondition?.type === 'on_date') {
    endDate = DateTime.fromISO(endCondition.value);
  } else {
    endDate = baseDate.plus({ years: 1 });
  }

  const recurrentSchedulings = [{ ...scheduling }];
  let currentDate = baseDate;
  let occurrenceCount = 1;

  while (true) {
    if (frequency.interval?.value === 'weeks') {
      currentDate = currentDate.plus({ weeks: frequency.value });
    } else if (frequency.interval?.value === 'months') {
      currentDate = currentDate.plus({ months: frequency.value });
    } else {
      currentDate = currentDate.plus({ days: frequency.value });
    }

    if (endCondition?.type === 'after' && occurrenceCount >= endCondition.value) break;
    if (currentDate > endDate) break;
    if (recurrentSchedulings.length >= MAX_RECURRENT_SCHEDULINGS) {
      console.warn(
        `Safety limit of ${MAX_RECURRENT_SCHEDULINGS} recurring schedulings reached. Some future occurrences were not created.`,
      );
      break;
    }

    const diffInDays = currentDate.diff(baseDate, 'days').days;
    const newScheduling = { ...scheduling };
    newScheduling.appointment_date = currentDate.toISODate();

    const newStartTime = baseStartTime.plus({ days: diffInDays });
    const newEndTime = baseEndTime.plus({ days: diffInDays });
    newScheduling.start_time = newStartTime.toSQL({ includeOffset: false }).substring(0, 19);
    newScheduling.end_time = newEndTime.toSQL({ includeOffset: false }).substring(0, 19);

    recurrentSchedulings.push(newScheduling);
    occurrenceCount += 1;
  }

  return recurrentSchedulings;
};

const createScheduling = async ({ schedulingData }) => {
  if (!Array.isArray(schedulingData) || schedulingData.length === 0) {
    throw new Error('Invalid schedulings data: must be a non-empty array');
  }

  let allSchedulings = [];
  for (const item of schedulingData) {
    const expanded = generateRecurrentSchedulings(item);
    allSchedulings = allSchedulings.concat(expanded);
  }

  if (allSchedulings.length > TOTAL_LIMIT) {
    throw new Error(
      `Safety limit exceeded: attempting to create ${allSchedulings.length} schedulings at once. Maximum allowed is ${TOTAL_LIMIT}.`,
    );
  }

  for (const item of allSchedulings) {
    if (!item.external_pet_id && !item.external_contact_id) continue;
    if (!item.clinic_id) {
      throw new Error(
        'clinic_id obrigatório quando external_pet_id ou external_contact_id presente',
      );
    }
    if (item.external_pet_id) {
      await ClinicExternalRepository.assertExternalPetBelongsToClinic({
        clinicId: item.clinic_id,
        externalPetId: item.external_pet_id,
      });
    }
    if (item.external_contact_id) {
      await ClinicExternalRepository.assertExternalContactBelongsToClinic({
        clinicId: item.clinic_id,
        externalContactId: item.external_contact_id,
      });
    }
  }

  const client = await pgPool.connect();
  const createdSchedulings = [];
  try {
    await client.query('BEGIN');
    for (const scheduling of allSchedulings) {
      const data = { ...scheduling };
      delete data.frequency;
      delete data.endCondition;
      const created = await SchedulingRepository.createScheduling({
        schedulingData: data,
        client,
      });
      createdSchedulings.push(created);
    }
    await client.query('COMMIT');
    return createdSchedulings;
  } catch (error) {
    await client.query('ROLLBACK');
    if (error.code === 'FORBIDDEN') throw error;
    throw new Error(`Service error: ${error.message}`);
  } finally {
    client.release();
  }
};

const petBelongsToOwner = async ({ petId, petOwnerId }) =>
  SchedulingRepository.petBelongsToOwner({ petId, petOwnerId });

const getAllSchedulings = async ({ date, status }) =>
  SchedulingRepository.getAllSchedulings({ date, status });

const getSchedulingsByClinic = async ({ clinicId, date, status }) =>
  SchedulingRepository.getSchedulingsByClinic({ clinicId, date, status });

const getSchedulingsByPetOwner = async ({ petOwnerId, date, status }) =>
  SchedulingRepository.getSchedulingsByPetOwner({ petOwnerId, date, status });

const getSchedulingsByPet = async ({ petId, date, status }) =>
  SchedulingRepository.getSchedulingsByPet({ petId, date, status });

const getSchedulingById = async ({ id }) => SchedulingRepository.getSchedulingById({ id });

const updateScheduling = async ({ id, schedulingData }) =>
  SchedulingRepository.updateScheduling({ id, schedulingData });

const cancelScheduling = async ({ id, actor }) =>
  SchedulingRepository.cancelScheduling({ id, actor });

const confirmScheduling = async ({ id, actor }) =>
  SchedulingRepository.confirmScheduling({ id, actor });

const deleteScheduling = async ({ id }) => SchedulingRepository.deleteScheduling({ id });

export default {
  createScheduling,
  petBelongsToOwner,
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
