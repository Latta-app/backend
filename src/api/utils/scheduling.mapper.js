import { DateTime } from 'luxon';

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

// appointment_date é o "dia do serviço" na agenda — precisa ser o dia em
// horário de Brasília, não UTC. Com toISOString (UTC), serviço 21h+ BRT
// caía no dia seguinte no grid.
const SCHEDULE_TZ = 'America/Sao_Paulo';

// Agrupamento de urgência dos estados. Existe pra ser a ÚNICA definição de
// "isso precisa de gente agora": o painel usa pra ORDENAR a lista e pra COLORIR
// a tag. Duas cópias da mesma regra divergiriam, e a cor passaria a discordar
// da ordem — o operador confiaria no sinal errado.
//
// O rótulo em PT-BR continua no STATE_LABELS acima; aqui só o grupo. Estado
// desconhecido cai em 'waiting': aparece na fila em vez de sumir dela.
export const STATUS_GROUPS = {
  ESCALATED: 'needs_attention',
  FAILED: 'needs_attention',
  INITIATED: 'waiting',
  CONTACTING: 'waiting',
  NEGOTIATING: 'waiting',
  WAITING_USER: 'waiting',
  WAITING_FINAL_CONFIRM: 'waiting',
  CONFIRMED: 'scheduled',
  COMPLETED: 'closed',
  CANCELLED_BY_USER: 'closed',
  CANCELLED_BY_MERCHANT: 'closed',
  NO_SHOW: 'closed',
};

const toISODate = (value) => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return DateTime.fromJSDate(date).setZone(SCHEDULE_TZ).toISODate();
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
      group: STATUS_GROUPS[row.state] ?? 'waiting',
    },
    // Dinheiro combinado no WhatsApp. `quoted_price_text` é TEXTO livre de
    // propósito ("uns 120 reais", "a partir de R$ 90"): é o que a clínica
    // escreveu, e converter pra número inventaria precisão que não existe.
    quoted_price_text: row.quoted_price_text ?? null,
    deposit: {
      required: row.requires_deposit ?? false,
      amount: row.deposit_amount ?? null,
      paid_at: row.deposit_paid_at ?? null,
    },
    // Quem falou por último de cada lado. O painel deriva daqui o "aguardando
    // a clínica há Xh" sem precisar de outra consulta.
    last_outbound_at: row.last_outbound_at ?? null,
    last_clinic_inbound_at: row.last_clinic_inbound_at ?? null,
    last_user_inbound_at: row.last_user_inbound_at ?? null,
    escalation_reason: row.escalation_reason ?? null,
    rating: row.rating ?? null,
    plan: null,
    paymentMethod: null,
    paymentStatus: null,
    user: null,
    clinic: row.clinic_id
      ? {
          id: row.clinic_id,
          name: row.clinic_name ?? null,
          // String única com o endereço completo, como a clínica foi cadastrada.
          // Sem tratamento: quebrar em partes exigiria as colunas que estão
          // vazias no banco (ver o comentário do BASE_SELECT no repositório).
          address: row.clinic_address ?? null,
          // Normalizado (55DDNNNNNNNNN). O painel usa pra exibir formatado E pra
          // achar o contato da clínica — os dois esperam esta forma.
          phone: row.clinic_phone ?? null,
        }
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
