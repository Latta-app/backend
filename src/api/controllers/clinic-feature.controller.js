import { isClinicPortalEnabled } from '../services/feature-flag.service.js';

const getRoleString = (req) => {
  const raw = req?.user?.role;
  if (typeof raw === 'string') return raw;
  return raw?.role || raw?.name || null;
};

const getClinicId = (req) =>
  req?.user?.clinic_id || req?.user?.role?.clinic_id || null;

// GET /clinic/feature-check
// Retorna { enabled: true/false } SEM disparar 403 — usado pelo frontend
// pra distinguir "nao tá no beta" de "erro de auth" (frontend mostra a mensagem
// adequada). Sempre 200 quando autenticado.
export const featureCheck = async (req, res) => {
  const role = getRoleString(req);
  const clinicId = getClinicId(req);

  // Roles que nao dependem da flag (admin/superAdmin/petOwner) recebem enabled=true
  // pra nao bloquearem fluxos legacy
  if (role !== 'clinic') {
    return res.json({
      code: 'CLINIC_FEATURE_CHECK',
      data: { feature: 'clinic_portal_v0', enabled: true, role },
    });
  }

  if (!clinicId) {
    return res.json({
      code: 'CLINIC_FEATURE_CHECK',
      data: {
        feature: 'clinic_portal_v0',
        enabled: false,
        reason: 'no_clinic_id_in_jwt',
      },
    });
  }

  const enabled = await isClinicPortalEnabled(clinicId);
  return res.json({
    code: 'CLINIC_FEATURE_CHECK',
    data: {
      feature: 'clinic_portal_v0',
      enabled,
      clinic_id: clinicId,
      reason: enabled ? null : 'not_in_beta',
    },
  });
};

export default { featureCheck };
