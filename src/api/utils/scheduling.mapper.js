export const STATE_LABELS = {
  INITIATED: 'Iniciado',
  CONTACTING: 'Contatando clínica',
  NEGOTIATING: 'Negociando',
  WAITING_USER: 'Aguardando tutor',
  WAITING_FINAL_CONFIRM: 'Aguardando confirmação',
  CONFIRMED: 'Confirmado',
  COMPLETED: 'Concluído',
  CANCELLED_BY_USER: 'Cancelado pelo tutor',
  CANCELLED_BY_MERCHANT: 'Cancelado pela clínica',
  NO_SHOW: 'Não compareceu',
  FAILED: 'Falhou',
  ESCALATED: 'Escalado',
};

const toISODate = (value) => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
};

export function mapSessionToScheduling(row) {
  if (!row) return null;

  const petId = row.pet_id ?? (Array.isArray(row.pet_ids) ? row.pet_ids[0] : null);
  const stateLabel = STATE_LABELS[row.state] ?? row.state;

  return {
    id: row.id,
    clinic_id: row.clinic_id,
    pet_id: petId,
    pet_ids: row.pet_ids ?? null,
    pet_owner_id: row.pet_owner_id,
    user_phone: row.user_phone,
    appointment_date: toISODate(row.scheduled_date),
    start_time: row.scheduled_date,
    end_time: row.scheduled_date,
    price: null,
    notes: row.service_requested ?? null,
    service_requested: row.service_requested ?? null,
    scheduled_service: row.scheduled_service ?? null,
    category: row.category,
    is_confirmed: row.state === 'CONFIRMED' || row.state === 'COMPLETED',
    source: row.source,
    state: row.state,
    state_history: row.state_history ?? [],
    external_pet_id: row.external_pet_id ?? null,
    external_contact_id: row.external_contact_id ?? null,
    confirmed_at: row.confirmed_at ?? null,
    created_at: row.created_at,
    updated_at: row.updated_at,
    serviceType: row.service_requested
      ? {
          id: null,
          name: row.service_requested,
          label: row.service_requested,
          color: null,
          emoji: null,
        }
      : null,
    schedulingStatus: {
      id: null,
      name: row.state,
      label: stateLabel,
    },
    plan: null,
    paymentMethod: null,
    paymentStatus: null,
    user: null,
    clinic: row.clinic_id
      ? { id: row.clinic_id, name: row.clinic_name ?? null }
      : null,
    pet: petId
      ? { id: petId, name: row.pet_name ?? null }
      : null,
    petOwner: row.pet_owner_id
      ? {
          id: row.pet_owner_id,
          email: row.pet_owner_email ?? null,
          name: row.pet_owner_name ?? null,
        }
      : null,
  };
}

export function mapRows(rows) {
  if (!rows) return [];
  return rows.map(mapSessionToScheduling);
}
