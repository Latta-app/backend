import { pgQuery } from '../../config/postgres.js';

const COLUMNS = `id, clinic_id, type, title, body, appointment_id, metadata, read_at, created_at`;

export const listNotifications = async ({ clinicId, limit = 50, unreadOnly = false }) => {
  const where = unreadOnly
    ? 'WHERE clinic_id = $1 AND read_at IS NULL'
    : 'WHERE clinic_id = $1';
  const { rows } = await pgQuery(
    `SELECT ${COLUMNS} FROM clinic_notifications ${where} ORDER BY created_at DESC LIMIT $2`,
    [clinicId, Math.min(Math.max(limit, 1), 200)],
  );
  return rows;
};

export const countUnread = async ({ clinicId }) => {
  const { rows } = await pgQuery(
    `SELECT count(*)::int AS unread FROM clinic_notifications WHERE clinic_id = $1 AND read_at IS NULL`,
    [clinicId],
  );
  return rows[0]?.unread ?? 0;
};

export const markRead = async ({ clinicId, id }) => {
  const { rowCount } = await pgQuery(
    `UPDATE clinic_notifications SET read_at = COALESCE(read_at, now())
       WHERE clinic_id = $1 AND id = $2`,
    [clinicId, id],
  );
  if (rowCount === 0) {
    const err = new Error('Notification not found');
    err.code = 'NOT_FOUND';
    throw err;
  }
};

export const markAllRead = async ({ clinicId }) => {
  const { rowCount } = await pgQuery(
    `UPDATE clinic_notifications SET read_at = now()
       WHERE clinic_id = $1 AND read_at IS NULL`,
    [clinicId],
  );
  return rowCount;
};

export default { listNotifications, countUnread, markRead, markAllRead };
