import { pgPool, pgQuery } from '../../config/postgres.js';
import { mapRows, mapSessionToScheduling } from '../utils/scheduling.mapper.js';

const BASE_SELECT = `
  SELECT
    s.id,
    s.user_phone,
    s.pet_owner_id,
    s.pet_id,
    s.pet_ids,
    s.clinic_id,
    s.clinic_phone_normalized,
    s.state,
    s.category,
    s.service_requested,
    s.scheduled_date,
    s.scheduled_service,
    s.state_history,
    s.source,
    s.external_pet_id,
    s.external_contact_id,
    s.confirmed_at,
    s.created_at,
    s.updated_at,
    c.name AS clinic_name,
    p.name AS pet_name,
    po.email AS pet_owner_email,
    po.name AS pet_owner_name
  FROM scheduling_sessions s
  LEFT JOIN clinics c ON c.id = s.clinic_id
  LEFT JOIN pets p ON p.id = s.pet_id
  LEFT JOIN pet_owners po ON po.id = s.pet_owner_id
`;

const buildDateAndStatusFilter = (params, alias = 's', startIndex = 1) => {
  const filters = [];
  const values = [];
  let i = startIndex;

  if (params?.date) {
    values.push(params.date);
    filters.push(`${alias}.scheduled_date::date = $${i}`);
    i += 1;
  }
  if (params?.status) {
    values.push(params.status);
    filters.push(`${alias}.state = $${i}`);
    i += 1;
  }
  return { filters, values, nextIndex: i };
};

const createScheduling = async ({ schedulingData, client = null }) => {
  const runner = client ?? pgPool;
  const {
    clinic_id,
    pet_id,
    pet_owner_id,
    user_phone,
    appointment_date,
    start_time,
    service_requested,
    scheduled_service,
    notes,
    category,
    external_pet_id,
    external_contact_id,
  } = schedulingData;

  const scheduledDate = resolveScheduledDate(appointment_date, start_time);
  const phone = user_phone ?? '';
  const cat = category ?? 'veterinaria';
  const serviceReq = service_requested ?? notes ?? null;
  const serviceLabel = scheduled_service ?? service_requested ?? notes ?? null;

  const result = await runner.query(
    `
    INSERT INTO scheduling_sessions (
      user_phone, pet_id, pet_owner_id, clinic_id,
      scheduled_date, service_requested, scheduled_service,
      category, state, source, state_history, confirmed_at,
      external_pet_id, external_contact_id
    ) VALUES (
      $1, $2, $3, $4,
      $5, $6, $7,
      $8, 'CONFIRMED', 'external',
      jsonb_build_array(jsonb_build_object('at', now(), 'state', 'CONFIRMED', 'source', 'backend_admin')),
      now(),
      $9, $10
    )
    RETURNING id
    `,
    [
      phone,
      pet_id ?? null,
      pet_owner_id ?? null,
      clinic_id,
      scheduledDate,
      serviceReq,
      serviceLabel,
      cat,
      external_pet_id ?? null,
      external_contact_id ?? null,
    ],
  );

  const insertedId = result.rows[0].id;
  return getSchedulingById({ id: insertedId, client: runner });
};

// Ownership check pra role petOwner: o pet precisa estar vinculado ao tutor na
// M:M pet_owner_pets. Usado por createScheduling pra impedir que um tutor agende
// (e vaze PII) pendurando o agendamento num pet que não é dele.
const petBelongsToOwner = async ({ petId, petOwnerId }) => {
  if (!petId || !petOwnerId) return false;
  const result = await pgQuery(
    `SELECT 1 FROM pet_owner_pets WHERE pet_id = $1 AND pet_owner_id = $2 LIMIT 1`,
    [petId, petOwnerId],
  );
  return result.rowCount > 0;
};

const getSchedulingById = async ({ id, client = null }) => {
  const runner = client ?? pgPool;
  const result = await runner.query(`${BASE_SELECT} WHERE s.id = $1 LIMIT 1`, [id]);
  if (result.rows.length === 0) {
    const error = new Error('Scheduling not found');
    error.code = 'NOT_FOUND';
    throw error;
  }
  return mapSessionToScheduling(result.rows[0]);
};

const getAllSchedulings = async ({ date, status } = {}) => {
  const { filters, values } = buildDateAndStatusFilter({ date, status });
  const where = filters.length > 0 ? `WHERE ${filters.join(' AND ')}` : '';
  const result = await pgQuery(
    `${BASE_SELECT} ${where} ORDER BY s.scheduled_date ASC NULLS LAST`,
    values,
  );
  return mapRows(result.rows);
};

const getSchedulingsByClinic = async ({ clinicId, date, status }) => {
  const { filters, values, nextIndex } = buildDateAndStatusFilter({ date, status }, 's', 2);
  values.unshift(clinicId);
  const where = `WHERE s.clinic_id = $1${filters.length ? ` AND ${filters.join(' AND ')}` : ''}`;
  const result = await pgQuery(
    `${BASE_SELECT} ${where} ORDER BY s.scheduled_date ASC NULLS LAST`,
    values,
  );
  // nextIndex unused — keeps signature explicit if extended later
  void nextIndex;
  return mapRows(result.rows);
};

const getSchedulingsByPetOwner = async ({ petOwnerId, date, status }) => {
  const { filters, values } = buildDateAndStatusFilter({ date, status }, 's', 2);
  values.unshift(petOwnerId);
  const where = `WHERE s.pet_owner_id = $1${filters.length ? ` AND ${filters.join(' AND ')}` : ''}`;
  const result = await pgQuery(
    `${BASE_SELECT} ${where} ORDER BY s.scheduled_date ASC NULLS LAST`,
    values,
  );
  return mapRows(result.rows);
};

const getSchedulingsByPet = async ({ petId, date, status, petOwnerId = null }) => {
  const values = [petId];
  const conditions = ['(s.pet_id = $1 OR $1 = ANY(s.pet_ids))'];
  let idx = 2;

  // Escopo por dono (role petOwner): só sessões onde o requester é o pet_owner_id.
  // Sem isso, um pet co-tutelado (guardian) devolve sessões — e PII — de outro
  // tutor. Admin/superAdmin chamam sem petOwnerId e continuam vendo tudo.
  if (petOwnerId) {
    values.push(petOwnerId);
    conditions.push(`s.pet_owner_id = $${idx}`);
    idx += 1;
  }

  const { filters, values: dsValues } = buildDateAndStatusFilter({ date, status }, 's', idx);
  values.push(...dsValues);
  conditions.push(...filters);

  const result = await pgQuery(
    `${BASE_SELECT} WHERE ${conditions.join(' AND ')} ORDER BY s.scheduled_date ASC NULLS LAST`,
    values,
  );
  return mapRows(result.rows);
};

const UPDATABLE_COLUMNS = {
  clinic_id: 'clinic_id',
  pet_id: 'pet_id',
  pet_owner_id: 'pet_owner_id',
  user_phone: 'user_phone',
  scheduled_date: 'scheduled_date',
  service_requested: 'service_requested',
  scheduled_service: 'scheduled_service',
  notes: 'service_requested',
  category: 'category',
};

const updateScheduling = async ({ id, schedulingData }) => {
  const sets = [];
  const values = [];
  let i = 1;

  const scheduledDate = resolveScheduledDate(
    schedulingData.appointment_date,
    schedulingData.start_time,
  );
  if (scheduledDate) {
    sets.push(`scheduled_date = $${i}`);
    values.push(scheduledDate);
    i += 1;
  }

  for (const [key, column] of Object.entries(UPDATABLE_COLUMNS)) {
    if (key === 'scheduled_date') continue;
    if (schedulingData[key] === undefined) continue;
    if (key === 'notes' && schedulingData.service_requested !== undefined) continue;
    sets.push(`${column} = $${i}`);
    values.push(schedulingData[key]);
    i += 1;
  }

  if (sets.length === 0) {
    return getSchedulingById({ id });
  }

  sets.push('updated_at = now()');
  values.push(id);
  const result = await pgQuery(
    `UPDATE scheduling_sessions SET ${sets.join(', ')} WHERE id = $${i} RETURNING id`,
    values,
  );
  if (result.rowCount === 0) {
    const error = new Error('Scheduling not found');
    error.code = 'NOT_FOUND';
    throw error;
  }
  return getSchedulingById({ id });
};

const cancelScheduling = async ({ id, actor = 'backend_admin' }) => {
  const result = await pgQuery(
    `
    UPDATE scheduling_sessions
       SET state = 'CANCELLED_BY_MERCHANT',
           state_history = COALESCE(state_history, '[]'::jsonb)
             || jsonb_build_array(jsonb_build_object('at', now(), 'state', 'CANCELLED_BY_MERCHANT', 'source', $2::text)),
           updated_at = now()
     WHERE id = $1
     RETURNING id
    `,
    [id, actor],
  );
  if (result.rowCount === 0) {
    const error = new Error('Scheduling not found');
    error.code = 'NOT_FOUND';
    throw error;
  }
  return getSchedulingById({ id });
};

const confirmScheduling = async ({ id, actor = 'backend_admin' }) => {
  const result = await pgQuery(
    `
    UPDATE scheduling_sessions
       SET state = 'CONFIRMED',
           confirmed_at = COALESCE(confirmed_at, now()),
           state_history = COALESCE(state_history, '[]'::jsonb)
             || jsonb_build_array(jsonb_build_object('at', now(), 'state', 'CONFIRMED', 'source', $2::text)),
           updated_at = now()
     WHERE id = $1
     RETURNING id
    `,
    [id, actor],
  );
  if (result.rowCount === 0) {
    const error = new Error('Scheduling not found');
    error.code = 'NOT_FOUND';
    throw error;
  }
  return getSchedulingById({ id });
};

const deleteScheduling = async ({ id }) => {
  const existing = await pgQuery(`SELECT source FROM scheduling_sessions WHERE id = $1 LIMIT 1`, [
    id,
  ]);
  if (existing.rowCount === 0) {
    const error = new Error('Scheduling not found');
    error.code = 'NOT_FOUND';
    throw error;
  }
  if (existing.rows[0].source !== 'external') {
    const error = new Error('Cannot hard delete a Latta-originated scheduling. Cancel instead.');
    error.code = 'FORBIDDEN';
    throw error;
  }

  await pgQuery(`DELETE FROM scheduling_sessions WHERE id = $1`, [id]);
  return true;
};

function resolveScheduledDate(appointmentDate, startTime) {
  if (!appointmentDate && !startTime) return null;

  if (startTime instanceof Date) return startTime;
  if (typeof startTime === 'string') {
    if (startTime.includes('T') || /\d{4}-\d{2}-\d{2}\s\d{2}:\d{2}/.test(startTime)) {
      return new Date(startTime);
    }
    if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(startTime) && appointmentDate) {
      const datePart =
        appointmentDate instanceof Date
          ? appointmentDate.toISOString().slice(0, 10)
          : String(appointmentDate).slice(0, 10);
      return new Date(
        `${datePart}T${startTime.length === 5 ? `${startTime}:00` : startTime}-03:00`,
      );
    }
  }

  if (appointmentDate instanceof Date) return appointmentDate;
  if (typeof appointmentDate === 'string') {
    if (appointmentDate.includes('T')) return new Date(appointmentDate);
    return new Date(`${appointmentDate}T00:00:00-03:00`);
  }

  return null;
}

export default {
  createScheduling,
  petBelongsToOwner,
  getSchedulingById,
  getAllSchedulings,
  getSchedulingsByClinic,
  getSchedulingsByPetOwner,
  getSchedulingsByPet,
  updateScheduling,
  cancelScheduling,
  confirmScheduling,
  deleteScheduling,
};
