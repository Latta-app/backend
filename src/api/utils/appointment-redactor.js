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

// Campos que existem pro PAINEL DO OPERADOR e não são da conta da clínica:
//   - escalation_reason: texto livre que o agente escreve ao escalar; pode
//     carregar contexto do tutor e é diagnóstico interno.
//   - rating: a nota que o TUTOR deu pra esta clínica. Mostrar isso pra ela é
//     decisão de produto, não efeito colateral de um campo novo no SELECT.
const OPERATOR_ONLY_KEYS = ['escalation_reason', 'rating'];

export const redactAppointmentForClinic = (appointment) => {
  if (!appointment) return appointment;
  const redacted = { ...appointment };

  // top-level
  if ('user_phone' in redacted) redacted.user_phone = null;
  for (const key of OPERATOR_ONLY_KEYS) {
    if (key in redacted) redacted[key] = null;
  }

  // nested
  if (redacted.petOwner) redacted.petOwner = redactNested(redacted.petOwner);
  if (redacted.owner) redacted.owner = redactNested(redacted.owner);

  return redacted;
};

export const redactAppointmentsForClinic = (rows) => {
  if (!Array.isArray(rows)) return rows;
  return rows.map(redactAppointmentForClinic);
};
