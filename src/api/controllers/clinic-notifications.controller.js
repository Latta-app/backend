import ClinicNotificationsRepository from '../repositories/clinic-notifications.repository.js';

const getClinicId = (req) =>
  req?.user?.clinic_id || req?.user?.role?.clinic_id || null;

const requireClinicId = (req, res) => {
  const clinicId = getClinicId(req);
  if (!clinicId) {
    res.status(400).json({ code: 'CLINIC_ID_REQUIRED', message: 'JWT sem clinic_id' });
    return null;
  }
  return clinicId;
};

const handleError = (res, err, code) => {
  if (err.code === 'NOT_FOUND') {
    return res.status(404).json({ code: 'NOT_FOUND', message: err.message });
  }
  console.error(`[clinic-notifications] ${code}:`, err.message);
  return res.status(500).json({ code, message: err.message });
};

export const list = async (req, res) => {
  const clinicId = requireClinicId(req, res);
  if (!clinicId) return undefined;
  try {
    const limit = req.query.limit ? Number(req.query.limit) : 50;
    const unreadOnly = req.query.unread === 'true' || req.query.unread === '1';
    const [rows, unread] = await Promise.all([
      ClinicNotificationsRepository.listNotifications({ clinicId, limit, unreadOnly }),
      ClinicNotificationsRepository.countUnread({ clinicId }),
    ]);
    return res.json({
      code: 'CLINIC_NOTIFICATIONS_FETCHED',
      data: { notifications: rows, unread_count: unread },
    });
  } catch (err) {
    return handleError(res, err, 'CLINIC_NOTIFICATIONS_FETCH_ERROR');
  }
};

export const markRead = async (req, res) => {
  const clinicId = requireClinicId(req, res);
  if (!clinicId) return undefined;
  try {
    await ClinicNotificationsRepository.markRead({ clinicId, id: req.params.id });
    return res.json({ code: 'CLINIC_NOTIFICATION_READ' });
  } catch (err) {
    return handleError(res, err, 'CLINIC_NOTIFICATION_READ_ERROR');
  }
};

export const markAllRead = async (req, res) => {
  const clinicId = requireClinicId(req, res);
  if (!clinicId) return undefined;
  try {
    const count = await ClinicNotificationsRepository.markAllRead({ clinicId });
    return res.json({ code: 'CLINIC_NOTIFICATIONS_ALL_READ', data: { updated: count } });
  } catch (err) {
    return handleError(res, err, 'CLINIC_NOTIFICATIONS_READ_ALL_ERROR');
  }
};

export default { list, markRead, markAllRead };
