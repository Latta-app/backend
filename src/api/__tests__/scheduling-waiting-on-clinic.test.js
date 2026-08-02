// "aguardando a clínica há N" é uma afirmação sobre quem falou por último no
// WhatsApp. Os contadores da sessão (last_outbound_at / last_clinic_inbound_at)
// só são escritos pelo merchant-scheduling-agent, então congelam no instante em
// que um humano assume — que é o desfecho que a escalação existe pra produzir.
//
// Caso real que originou isto (clínica 5531986974851, 31/07/26): contadores
// pararam em 13:02:32 (nosso) e 13:02:28 (dela), 3s na ordem errada. Depois
// disso a operadora escreveu, a clínica respondeu "agendado!" e "Nada!" às
// 13:08, e nada disso tocou os contadores. O card exibia "aguardando a clínica
// há 1 dia" sobre uma conversa encerrada e um agendamento confirmado.
//
// pgQuery é mockado (sem DB): asseguramos o SQL + a regra do mapper.
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../config/postgres.js', () => ({
  pgQuery: vi.fn(async () => ({ rows: [] })),
  pgPool: { query: vi.fn(async () => ({ rows: [] })), connect: vi.fn() },
}));

import SchedulingRepository from '../repositories/scheduling.repository.js';
import { mapSessionToScheduling } from '../utils/scheduling.mapper.js';
import { pgQuery } from '../../config/postgres.js';

const lastSql = () => pgQuery.mock.calls[pgQuery.mock.calls.length - 1][0];

beforeEach(() => vi.clearAllMocks());

describe('SQL: a espera é medida na conversa', () => {
  it('o BASE_SELECT deriva os dois lados do chat_history — em TODAS as listas', async () => {
    // As três listas compartilham o BASE_SELECT. Se alguém "otimizar" uma delas
    // com um SELECT próprio, aquele caminho volta a ler só o contador congelado
    // e o card volta a mentir apenas ali — o tipo de divergência que ninguém vê.
    for (const call of [
      () => SchedulingRepository.getSchedulingsByPetOwner({ petOwnerId: 'OWNER1' }),
      () => SchedulingRepository.getSchedulingsByClinic({ clinicId: 'CLINIC1' }),
      () => SchedulingRepository.getSchedulingsByPet({ petId: 'PET1' }),
    ]) {
      await call();
      expect(lastSql()).toContain('AS thread_outbound_at');
      expect(lastSql()).toContain('AS thread_clinic_inbound_at');
    }
  });

  it('discrimina por journey, não por sent_by', async () => {
    // Na conversa da CLÍNICA o inbound dela vem rotulado sent_by='pet owner'
    // (medido em prod). Filtrar por sent_by acharia que a clínica é o tutor.
    await SchedulingRepository.getSchedulingsByClinic({ clinicId: 'CLINIC1' });
    expect(lastSql()).toContain("ch.journey = 'enviada'");
    expect(lastSql()).toContain("ch.journey = 'recebida'");
  });

  it('casa a conversa pelo telefone da sessão, com a clínica como reserva', async () => {
    // clinic_phone_normalized é o número pra onde o agente de fato escreveu.
    await SchedulingRepository.getSchedulingsByClinic({ clinicId: 'CLINIC1' });
    expect(lastSql()).toContain('coalesce(s.clinic_phone_normalized, c.phone_normalized)');
  });
});

describe('regra: waiting_on_clinic_since', () => {
  // O caso reportado, com os timestamps exatos de prod.
  const casoLili = {
    id: 'S1',
    state: 'CONFIRMED',
    last_outbound_at: '2026-07-31T13:02:32.246907+00:00',
    last_clinic_inbound_at: '2026-07-31T13:02:28.972+00:00',
    thread_outbound_at: '2026-07-31T13:08:33.072+00:00',
    thread_clinic_inbound_at: '2026-07-31T13:08:47.592+00:00',
  };

  it('a conversa vence o contador: clínica respondeu depois, logo não há espera', () => {
    // Os contadores sozinhos diriam que sim (13:02:32 > 13:02:28).
    expect(mapSessionToScheduling(casoLili).waiting_on_clinic_since).toBeNull();
  });

  it('confirmado NÃO é passe livre: pergunta feita depois da confirmação conta', () => {
    // O ponto que o operador levantou. CONFIRMED não prova que nada está aberto;
    // se abrimos assunto novo e a clínica não voltou, a espera é real.
    const mapped = mapSessionToScheduling({
      ...casoLili,
      thread_outbound_at: '2026-08-01T09:00:00.000+00:00',
    });
    expect(mapped.waiting_on_clinic_since).toBe('2026-08-01T09:00:00.000+00:00');
  });

  it('clínica sem conversa registrada cai nos contadores da sessão', () => {
    // Existe na base: sessão com contador e nenhuma linha em chat_history.
    // Sem o fallback, essas parariam de mostrar espera nenhuma.
    const mapped = mapSessionToScheduling({
      id: 'S2',
      state: 'CONTACTING',
      last_outbound_at: '2026-07-22T22:16:28.115+00:00',
      last_clinic_inbound_at: null,
      thread_outbound_at: null,
      thread_clinic_inbound_at: null,
    });
    expect(mapped.waiting_on_clinic_since).toBe('2026-07-22T22:16:28.115+00:00');
  });

  it('pedido encerrado nunca aguarda, mesmo com a última palavra sendo nossa', () => {
    // Sem isto, um agendamento de maio exibe "aguardando há 90 dias" pra sempre.
    for (const state of [
      'COMPLETED',
      'CANCELLED_BY_USER',
      'CANCELLED_BY_MERCHANT',
      'NO_SHOW',
      'FAILED',
    ]) {
      const mapped = mapSessionToScheduling({
        id: 'S3',
        state,
        thread_outbound_at: '2026-05-01T10:00:00.000+00:00',
        thread_clinic_inbound_at: null,
      });
      expect(mapped.waiting_on_clinic_since, `estado ${state}`).toBeNull();
    }
  });

  it('FAILED não aguarda, apesar de dividir o grupo com ESCALATED', () => {
    // FAILED mora em needs_attention junto de ESCALATED, então a regra não pode
    // ser pelo grupo: o pedido falhou (ninguém espera resposta), enquanto o
    // escalado segue aberto na mão de um humano.
    const base = {
      id: 'S4',
      thread_outbound_at: '2026-07-31T23:08:07.908+00:00',
      thread_clinic_inbound_at: null,
    };
    expect(mapSessionToScheduling({ ...base, state: 'FAILED' }).waiting_on_clinic_since).toBeNull();
    expect(mapSessionToScheduling({ ...base, state: 'ESCALATED' }).waiting_on_clinic_since).toBe(
      '2026-07-31T23:08:07.908+00:00',
    );
  });

  it('empate conta como respondida', () => {
    // Falar no mesmo instante não é a clínica nos devendo nada.
    const mesmoInstante = '2026-07-31T13:00:00.000+00:00';
    const mapped = mapSessionToScheduling({
      id: 'S5',
      state: 'NEGOTIATING',
      thread_outbound_at: mesmoInstante,
      thread_clinic_inbound_at: mesmoInstante,
    });
    expect(mapped.waiting_on_clinic_since).toBeNull();
  });

  it('sem nenhum outbound não há espera pra mostrar', () => {
    const mapped = mapSessionToScheduling({ id: 'S6', state: 'INITIATED' });
    expect(mapped.waiting_on_clinic_since).toBeNull();
  });

  it('o campo existe sempre, como null — nunca sai do JSON', () => {
    // O card decide por falsy; `undefined` some da resposta e o front não
    // distingue "não há espera" de "o backend parou de mandar o campo".
    const mapped = mapSessionToScheduling({ id: 'S7', state: 'CONFIRMED' });
    expect('waiting_on_clinic_since' in mapped).toBe(true);
    expect(mapped.waiting_on_clinic_since).toBeNull();
  });
});
