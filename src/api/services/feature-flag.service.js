// feature-flag.service.js
// Espelha o pattern da EF marketplace-service/lib/feature-flags.ts:
//   Schema: feature_flags(feature_name, user_phone, enabled)
//   user_phone='*' (ou NULL) = released pra todos
//   user_phone=<id> = liberado pra esse id especifico (beta)
//
// Pra clinic-portal, usamos clinic_id (uuid -> text) na coluna user_phone.

import { pgQuery } from '../../config/postgres.js';

export const isFeatureEnabledForClinic = async (featureName, clinicId) => {
  if (!featureName) return false;
  try {
    const { rows } = await pgQuery(
      `
      SELECT enabled, user_phone
      FROM feature_flags
      WHERE feature_name = $1
        AND enabled = true
        AND (user_phone = $2 OR user_phone = '*' OR user_phone IS NULL)
      LIMIT 5
      `,
      [featureName, clinicId || ''],
    );
    if (!rows || rows.length === 0) return false;
    // Released to all: row com user_phone='*' ou NULL
    if (rows.some((r) => r.user_phone === '*' || r.user_phone === null)) return true;
    return rows.some((r) => r.user_phone === clinicId);
  } catch (err) {
    console.warn(`[feature-flag] check failed for ${featureName}/${clinicId}:`, err?.message);
    return false;
  }
};

// Convenience: a flag oficial do MVP.
export const isClinicPortalEnabled = (clinicId) =>
  isFeatureEnabledForClinic('clinic_portal_v0', clinicId);

export default { isFeatureEnabledForClinic, isClinicPortalEnabled };
