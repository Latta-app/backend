// H-2 #4 (camada repo) — getSchedulingsByPet monta o filtro s.pet_owner_id
// quando petOwnerId é passado, com placeholders na ordem certa. pgQuery é
// mockado (sem DB): asseguramos SQL + params.
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../config/postgres.js', () => ({
  pgQuery: vi.fn(async () => ({ rows: [] })),
  pgPool: { query: vi.fn(), connect: vi.fn() },
}));

import SchedulingRepository from '../repositories/scheduling.repository.js';
import { pgQuery } from '../../config/postgres.js';

const lastCall = () => pgQuery.mock.calls[pgQuery.mock.calls.length - 1];

beforeEach(() => vi.clearAllMocks());

describe('#4 — repo getSchedulingsByPet', () => {
  it('SEM petOwnerId: nenhum filtro de dono, params = [petId]', async () => {
    await SchedulingRepository.getSchedulingsByPet({ petId: 'PET1' });
    const [sql, params] = lastCall();
    expect(sql).not.toContain('s.pet_owner_id = $');
    expect(params).toEqual(['PET1']);
  });

  it('COM petOwnerId: filtro s.pet_owner_id = $2, params = [petId, ownerId]', async () => {
    await SchedulingRepository.getSchedulingsByPet({ petId: 'PET1', petOwnerId: 'OWNER1' });
    const [sql, params] = lastCall();
    expect(sql).toContain('s.pet_owner_id = $2');
    expect(params).toEqual(['PET1', 'OWNER1']);
  });

  it('COM petOwnerId + date: placeholders na ordem $1/$2/$3', async () => {
    await SchedulingRepository.getSchedulingsByPet({
      petId: 'PET1',
      petOwnerId: 'OWNER1',
      date: '2026-08-01',
    });
    const [sql, params] = lastCall();
    expect(sql).toContain('s.pet_owner_id = $2');
    expect(sql).toContain('s.scheduled_date::date = $3');
    expect(params).toEqual(['PET1', 'OWNER1', '2026-08-01']);
  });

  it('SEM petOwnerId + date: date cai em $2', async () => {
    await SchedulingRepository.getSchedulingsByPet({ petId: 'PET1', date: '2026-08-01' });
    const [sql, params] = lastCall();
    expect(sql).not.toContain('s.pet_owner_id = $');
    expect(sql).toContain('s.scheduled_date::date = $2');
    expect(params).toEqual(['PET1', '2026-08-01']);
  });
});
