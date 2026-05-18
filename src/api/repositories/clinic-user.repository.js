import { pgQuery } from '../../config/postgres.js';

const COLUMNS = `id, clinic_id, email, password_hash, activation_token, activation_token_expires_at,
  password_reset_token, password_reset_expires_at, activated_at, last_login_at, created_at, updated_at`;

export const findByEmail = async (email) => {
  const { rows } = await pgQuery(
    `SELECT ${COLUMNS} FROM clinic_users WHERE lower(email) = lower($1) LIMIT 1`,
    [email],
  );
  return rows[0] ?? null;
};

// Login por phone: resolve via clinics.phone_normalized -> clinic_users.clinic_id.
// Aceita phone com ou sem mascara — normaliza removendo nao-digitos.
// Retorna apenas 1 (mais antigo) se houver multiplos clinic_users pra mesma clinic.
export const findByPhone = async (phone) => {
  const normalized = String(phone || '').replace(/\D+/g, '');
  if (!normalized) return null;
  const { rows } = await pgQuery(
    `SELECT ${COLUMNS.split(',').map((c) => `cu.${c.trim()}`).join(', ')}
     FROM clinic_users cu
     JOIN clinics c ON c.id = cu.clinic_id
     WHERE c.phone_normalized = $1
     ORDER BY cu.created_at ASC
     LIMIT 1`,
    [normalized],
  );
  return rows[0] ?? null;
};

export const findByActivationToken = async (token) => {
  const { rows } = await pgQuery(
    `SELECT ${COLUMNS} FROM clinic_users WHERE activation_token = $1 LIMIT 1`,
    [token],
  );
  return rows[0] ?? null;
};

export const findByResetToken = async (token) => {
  const { rows } = await pgQuery(
    `SELECT ${COLUMNS} FROM clinic_users WHERE password_reset_token = $1 LIMIT 1`,
    [token],
  );
  return rows[0] ?? null;
};

export const upsertForActivation = async ({ clinicId, email, token, expiresAt }) => {
  const { rows } = await pgQuery(
    `
    INSERT INTO clinic_users (clinic_id, email, activation_token, activation_token_expires_at)
    VALUES ($1, $2, $3, $4)
    ON CONFLICT (email) DO UPDATE
      SET activation_token = EXCLUDED.activation_token,
          activation_token_expires_at = EXCLUDED.activation_token_expires_at,
          clinic_id = EXCLUDED.clinic_id,
          updated_at = now()
    RETURNING ${COLUMNS}
    `,
    [clinicId, email.toLowerCase(), token, expiresAt],
  );
  return rows[0];
};

export const setPasswordAndActivate = async ({ id, passwordHash }) => {
  const { rows } = await pgQuery(
    `
    UPDATE clinic_users
       SET password_hash = $2,
           activation_token = NULL,
           activation_token_expires_at = NULL,
           activated_at = COALESCE(activated_at, now()),
           updated_at = now()
     WHERE id = $1
     RETURNING ${COLUMNS}
    `,
    [id, passwordHash],
  );
  return rows[0] ?? null;
};

export const setResetToken = async ({ id, token, expiresAt }) => {
  await pgQuery(
    `UPDATE clinic_users SET password_reset_token = $2, password_reset_expires_at = $3, updated_at = now() WHERE id = $1`,
    [id, token, expiresAt],
  );
};

export const resetPassword = async ({ id, passwordHash }) => {
  const { rows } = await pgQuery(
    `
    UPDATE clinic_users
       SET password_hash = $2,
           password_reset_token = NULL,
           password_reset_expires_at = NULL,
           updated_at = now()
     WHERE id = $1
     RETURNING ${COLUMNS}
    `,
    [id, passwordHash],
  );
  return rows[0] ?? null;
};

export const touchLastLogin = async (id) => {
  await pgQuery(`UPDATE clinic_users SET last_login_at = now(), updated_at = now() WHERE id = $1`, [
    id,
  ]);
};

export const setClinicActivated = async (clinicId) => {
  await pgQuery(
    `UPDATE clinics SET activation_status = 'activated' WHERE id = $1 AND activation_status <> 'activated'`,
    [clinicId],
  );
};

export const getClinic = async (clinicId) => {
  const { rows } = await pgQuery(
    `SELECT id, name, phone, activation_status, notification_settings FROM clinics WHERE id = $1 LIMIT 1`,
    [clinicId],
  );
  return rows[0] ?? null;
};

export default {
  findByEmail,
  findByPhone,
  findByActivationToken,
  findByResetToken,
  upsertForActivation,
  setPasswordAndActivate,
  setResetToken,
  resetPassword,
  touchLastLogin,
  setClinicActivated,
  getClinic,
};
