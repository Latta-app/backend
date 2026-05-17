// clinic-portal-flag.middleware.js
// Gate: roles 'clinic' so passam se clinic_portal_v0 estiver liberada pro
// seu clinic_id. superAdmin/admin passam direto (não dependem da flag —
// precisam acessar pra debugar / gerenciar a clinica).

import { isClinicPortalEnabled } from '../services/feature-flag.service.js';

const getRoleString = (req) => {
  const raw = req?.user?.role;
  if (typeof raw === 'string') return raw;
  return raw?.role || raw?.name || null;
};

const getClinicId = (req) =>
  req?.user?.clinic_id || req?.user?.role?.clinic_id || null;

export const requireClinicPortalFlag = async (req, res, next) => {
  const role = getRoleString(req);
  if (role !== 'clinic') return next();
  const clinicId = getClinicId(req);
  if (!clinicId) {
    return res.status(403).json({
      code: 'CLINIC_PORTAL_NO_CLINIC_ID',
      message: 'JWT sem clinic_id',
    });
  }
  const enabled = await isClinicPortalEnabled(clinicId);
  if (!enabled) {
    return res.status(403).json({
      code: 'CLINIC_PORTAL_NOT_IN_BETA',
      message:
        'Sua clínica ainda não está no beta do painel. Fala com a Latta pra entrar na lista.',
    });
  }
  return next();
};

export default requireClinicPortalFlag;
