// appointment-redactor.js
// Modulo puro que remove campos sensiveis (telefone, email) de um agendamento
// antes de devolver pra role 'clinic'. Outras roles (admin/superAdmin/petOwner
// dono do agendamento) recebem o payload completo.
//
// Decisao do PRD: clinica VE o NOME do tutor mas NUNCA o telefone/email — pra
// preservar privacidade e impedir bypass de canal (clinic não deve abordar tutor
// fora da Latta).

const SENSITIVE_OWNER_KEYS = ['phone', 'email', 'cell_phone'];

const redactNested = (obj) => {
  if (!obj || typeof obj !== 'object') return obj;
  const cleaned = { ...obj };
  for (const key of SENSITIVE_OWNER_KEYS) {
    if (key in cleaned) cleaned[key] = null;
  }
  return cleaned;
};

export const redactAppointmentForClinic = (appointment) => {
  if (!appointment) return appointment;
  const redacted = { ...appointment };

  // top-level
  if ('user_phone' in redacted) redacted.user_phone = null;

  // nested
  if (redacted.petOwner) redacted.petOwner = redactNested(redacted.petOwner);
  if (redacted.owner) redacted.owner = redactNested(redacted.owner);

  return redacted;
};

export const redactAppointmentsForClinic = (rows) => {
  if (!Array.isArray(rows)) return rows;
  return rows.map(redactAppointmentForClinic);
};
