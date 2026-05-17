import { pgPool, pgQuery } from '../../config/postgres.js';

// ============================================================================
// clinic_external_pets
// ============================================================================

const PET_COLUMNS = `id, clinic_id, name, species, breed, birthdate, weight_kg, notes, created_at, updated_at`;

export const listExternalPets = async ({ clinicId, q }) => {
  const params = [clinicId];
  let where = 'WHERE clinic_id = $1';
  if (q) {
    params.push(`%${q.toLowerCase()}%`);
    where += ` AND lower(name) LIKE $${params.length}`;
  }
  const { rows } = await pgQuery(
    `SELECT ${PET_COLUMNS} FROM clinic_external_pets ${where} ORDER BY name ASC`,
    params,
  );
  return rows;
};

export const getExternalPet = async ({ clinicId, id }) => {
  const { rows } = await pgQuery(
    `SELECT ${PET_COLUMNS} FROM clinic_external_pets WHERE clinic_id = $1 AND id = $2 LIMIT 1`,
    [clinicId, id],
  );
  return rows[0] ?? null;
};

export const createExternalPet = async ({ clinicId, data }) => {
  const { rows } = await pgQuery(
    `INSERT INTO clinic_external_pets (clinic_id, name, species, breed, birthdate, weight_kg, notes)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING ${PET_COLUMNS}`,
    [
      clinicId,
      data.name,
      data.species ?? null,
      data.breed ?? null,
      data.birthdate ?? null,
      data.weight_kg ?? null,
      data.notes ?? null,
    ],
  );
  return rows[0];
};

export const updateExternalPet = async ({ clinicId, id, data }) => {
  const allowed = ['name', 'species', 'breed', 'birthdate', 'weight_kg', 'notes'];
  const sets = [];
  const values = [];
  let i = 1;
  for (const key of allowed) {
    if (data[key] === undefined) continue;
    sets.push(`${key} = $${i}`);
    values.push(data[key]);
    i += 1;
  }
  if (sets.length === 0) {
    return getExternalPet({ clinicId, id });
  }
  values.push(clinicId, id);
  const { rows, rowCount } = await pgQuery(
    `UPDATE clinic_external_pets
       SET ${sets.join(', ')}
     WHERE clinic_id = $${i} AND id = $${i + 1}
     RETURNING ${PET_COLUMNS}`,
    values,
  );
  if (rowCount === 0) {
    const err = new Error('External pet not found');
    err.code = 'NOT_FOUND';
    throw err;
  }
  return rows[0];
};

export const deleteExternalPet = async ({ clinicId, id }) => {
  const { rowCount } = await pgQuery(
    `DELETE FROM clinic_external_pets WHERE clinic_id = $1 AND id = $2`,
    [clinicId, id],
  );
  if (rowCount === 0) {
    const err = new Error('External pet not found');
    err.code = 'NOT_FOUND';
    throw err;
  }
  return true;
};

// ============================================================================
// clinic_external_contacts
// ============================================================================

const CONTACT_COLUMNS = `id, clinic_id, name, phone, email, notes, created_at, updated_at`;

export const listExternalContacts = async ({ clinicId, q }) => {
  const params = [clinicId];
  let where = 'WHERE clinic_id = $1';
  if (q) {
    params.push(`%${q.toLowerCase()}%`);
    where += ` AND (lower(name) LIKE $${params.length} OR lower(coalesce(email,'')) LIKE $${params.length})`;
  }
  const { rows } = await pgQuery(
    `SELECT ${CONTACT_COLUMNS} FROM clinic_external_contacts ${where} ORDER BY name ASC`,
    params,
  );
  return rows;
};

export const getExternalContact = async ({ clinicId, id }) => {
  const { rows } = await pgQuery(
    `SELECT ${CONTACT_COLUMNS} FROM clinic_external_contacts WHERE clinic_id = $1 AND id = $2 LIMIT 1`,
    [clinicId, id],
  );
  return rows[0] ?? null;
};

export const createExternalContact = async ({ clinicId, data }) => {
  const { rows } = await pgQuery(
    `INSERT INTO clinic_external_contacts (clinic_id, name, phone, email, notes)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING ${CONTACT_COLUMNS}`,
    [clinicId, data.name, data.phone ?? null, data.email ?? null, data.notes ?? null],
  );
  return rows[0];
};

export const updateExternalContact = async ({ clinicId, id, data }) => {
  const allowed = ['name', 'phone', 'email', 'notes'];
  const sets = [];
  const values = [];
  let i = 1;
  for (const key of allowed) {
    if (data[key] === undefined) continue;
    sets.push(`${key} = $${i}`);
    values.push(data[key]);
    i += 1;
  }
  if (sets.length === 0) {
    return getExternalContact({ clinicId, id });
  }
  values.push(clinicId, id);
  const { rows, rowCount } = await pgQuery(
    `UPDATE clinic_external_contacts
       SET ${sets.join(', ')}
     WHERE clinic_id = $${i} AND id = $${i + 1}
     RETURNING ${CONTACT_COLUMNS}`,
    values,
  );
  if (rowCount === 0) {
    const err = new Error('External contact not found');
    err.code = 'NOT_FOUND';
    throw err;
  }
  return rows[0];
};

export const deleteExternalContact = async ({ clinicId, id }) => {
  const { rowCount } = await pgQuery(
    `DELETE FROM clinic_external_contacts WHERE clinic_id = $1 AND id = $2`,
    [clinicId, id],
  );
  if (rowCount === 0) {
    const err = new Error('External contact not found');
    err.code = 'NOT_FOUND';
    throw err;
  }
  return true;
};

// ============================================================================
// Ownership helpers (usados pelo scheduling.controller pra validar external_*_id)
// ============================================================================

export const assertExternalPetBelongsToClinic = async ({ clinicId, externalPetId }) => {
  const { rows } = await pgQuery(
    `SELECT id FROM clinic_external_pets WHERE clinic_id = $1 AND id = $2 LIMIT 1`,
    [clinicId, externalPetId],
  );
  if (rows.length === 0) {
    const err = new Error('external_pet_id does not belong to this clinic');
    err.code = 'FORBIDDEN';
    throw err;
  }
};

export const assertExternalContactBelongsToClinic = async ({ clinicId, externalContactId }) => {
  const { rows } = await pgQuery(
    `SELECT id FROM clinic_external_contacts WHERE clinic_id = $1 AND id = $2 LIMIT 1`,
    [clinicId, externalContactId],
  );
  if (rows.length === 0) {
    const err = new Error('external_contact_id does not belong to this clinic');
    err.code = 'FORBIDDEN';
    throw err;
  }
};

export default {
  listExternalPets,
  getExternalPet,
  createExternalPet,
  updateExternalPet,
  deleteExternalPet,
  listExternalContacts,
  getExternalContact,
  createExternalContact,
  updateExternalContact,
  deleteExternalContact,
  assertExternalPetBelongsToClinic,
  assertExternalContactBelongsToClinic,
};
