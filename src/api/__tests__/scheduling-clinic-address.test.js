// Painel de Agendamentos do TUTOR: o card responde "onde ele vai", e pra isso
// precisa do endereço da clínica, não só do nome (rede com várias unidades
// repete o nome). São dois pontos que precisam concordar — a coluna sai do
// SELECT e o mapper a entrega no `clinic` — e cada um falha em silêncio
// sozinho: SELECT sem a coluna devolve `undefined` que o `??` transforma em
// null, e mapper sem o campo simplesmente não expõe o dado que já veio.
// pgQuery é mockado (sem DB): asseguramos SQL + shape.
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

describe('endereço da clínica no agendamento', () => {
  it('o BASE_SELECT traz c.address — e chega em TODAS as consultas de lista', async () => {
    // As três listas compartilham o BASE_SELECT. Verificar as três impede que
    // alguém "otimize" uma delas com um SELECT próprio e deixe o painel do
    // tutor sem endereço só naquele caminho.
    await SchedulingRepository.getSchedulingsByPetOwner({ petOwnerId: 'OWNER1' });
    expect(lastSql()).toContain('c.address AS clinic_address');

    await SchedulingRepository.getSchedulingsByClinic({ clinicId: 'CLINIC1' });
    expect(lastSql()).toContain('c.address AS clinic_address');

    await SchedulingRepository.getSchedulingsByPet({ petId: 'PET1' });
    expect(lastSql()).toContain('c.address AS clinic_address');
  });

  it('o mapper entrega o endereço dentro de `clinic`', () => {
    const mapped = mapSessionToScheduling({
      id: 'S1',
      clinic_id: 'CLINIC1',
      clinic_name: 'Centro Veterinário Seres',
      clinic_address: 'Av. Nossa Sra. do Carmo, 1448 - São Pedro, Belo Horizonte - MG, 30330-000',
      state: 'CONFIRMED',
    });

    expect(mapped.clinic).toEqual({
      id: 'CLINIC1',
      name: 'Centro Veterinário Seres',
      address: 'Av. Nossa Sra. do Carmo, 1448 - São Pedro, Belo Horizonte - MG, 30330-000',
    });
  });

  it('clínica sem endereço cadastrado vira null, não undefined', () => {
    // O card decide "mostro a linha do endereço?" por falsy, e `undefined`
    // some do JSON da resposta — o front não conseguiria distinguir "clínica
    // sem endereço" de "o backend parou de mandar esse campo".
    const mapped = mapSessionToScheduling({
      id: 'S1',
      clinic_id: 'CLINIC1',
      clinic_name: 'Íris Teste S',
      clinic_address: null,
      state: 'CONFIRMED',
    });

    expect(mapped.clinic.address).toBeNull();
    expect('address' in mapped.clinic).toBe(true);
  });
});
