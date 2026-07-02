// H-2 #3 — createScheduling não pode deixar petOwner forjar/vazar.
// Monta a rota real + controller real + validators/redactor reais; só a camada
// de serviço/DB é mockada. Verifica bind de pet_owner_id, ownership do pet e
// redação da resposta.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import express from 'express';
import { httpRequest, petOwnerToken, adminToken } from './helpers.js';

vi.mock('../services/scheduling.service.js', () => ({
  default: {
    createScheduling: vi.fn(async ({ schedulingData }) =>
      schedulingData.map((s, i) => ({
        id: `sess-${i}`,
        clinic_id: s.clinic_id,
        pet_id: s.pet_id,
        pet_owner_id: s.pet_owner_id,
        user_phone: s.user_phone ?? '5511999999999',
        petOwner: { id: s.pet_owner_id, email: 'leak-victim@example.com', name: 'Fulano' },
      })),
    ),
    petBelongsToOwner: vi.fn(async () => true),
  },
}));
vi.mock('../services/merchant-scheduling-agent.service.js', () => ({ default: {} }));
vi.mock('../services/clinic-activity-log.service.js', () => ({
  logFromReq: vi.fn(),
  default: {},
}));
vi.mock('../middlewares/clinic-portal-flag.middleware.js', () => ({
  requireClinicPortalFlag: (req, res, next) => next(),
  default: (req, res, next) => next(),
}));

const OWNER_ID = '33333333-3333-3333-3333-333333333333';
const VICTIM_OWNER_ID = '99999999-9999-9999-9999-999999999999';
const PET_ID = '22222222-2222-2222-2222-222222222222';
const CLINIC_ID = '11111111-1111-1111-1111-111111111111';
const VALID = {
  clinic_id: CLINIC_ID,
  appointment_date: '2026-08-01',
  start_time: '10:00',
  pet_id: PET_ID,
};

let app;
let SchedulingService;
beforeEach(async () => {
  vi.clearAllMocks();
  ({ default: SchedulingService } = await import('../services/scheduling.service.js'));
  SchedulingService.petBelongsToOwner.mockResolvedValue(true);
  const { default: schedulingRoutes } = await import('../routes/private/scheduling.routes.js');
  app = express();
  app.use(express.json());
  app.use('/api/scheduling', schedulingRoutes);
});

describe('#3 — createScheduling bind do petOwner', () => {
  it('403 quando o pet_id não pertence ao tutor', async () => {
    SchedulingService.petBelongsToOwner.mockResolvedValueOnce(false);
    const res = await httpRequest(app, {
      method: 'POST',
      path: '/api/scheduling',
      token: petOwnerToken({ id: OWNER_ID }),
      body: { ...VALID, pet_owner_id: VICTIM_OWNER_ID },
    });
    expect(res.status).toBe(403);
    expect(SchedulingService.createScheduling).not.toHaveBeenCalled();
  });

  it('força pet_owner_id = req.user.id, ignora o do body e zera user_phone', async () => {
    const res = await httpRequest(app, {
      method: 'POST',
      path: '/api/scheduling',
      token: petOwnerToken({ id: OWNER_ID }),
      body: { ...VALID, pet_owner_id: VICTIM_OWNER_ID, user_phone: '5511888888888' },
    });
    expect(res.status).toBe(201);
    const arg = SchedulingService.createScheduling.mock.calls[0][0].schedulingData;
    expect(arg[0].pet_owner_id).toBe(OWNER_ID);
    expect(arg[0].pet_owner_id).not.toBe(VICTIM_OWNER_ID);
    expect(arg[0].user_phone).toBeNull();
    expect(SchedulingService.petBelongsToOwner).toHaveBeenCalledWith({
      petId: PET_ID,
      petOwnerId: OWNER_ID,
    });
  });

  it('redige a resposta do petOwner (sem email/phone)', async () => {
    const res = await httpRequest(app, {
      method: 'POST',
      path: '/api/scheduling',
      token: petOwnerToken({ id: OWNER_ID }),
      body: { ...VALID, pet_owner_id: VICTIM_OWNER_ID },
    });
    expect(res.status).toBe(201);
    const row = res.body.data[0];
    expect(row.user_phone).toBeNull();
    expect(row.petOwner.email).toBeNull();
    expect(row.petOwner.name).toBe('Fulano'); // nome é permitido
  });

  it('400 quando petOwner não manda pet_id', async () => {
    const { pet_id, ...noPet } = VALID;
    void pet_id;
    const res = await httpRequest(app, {
      method: 'POST',
      path: '/api/scheduling',
      token: petOwnerToken({ id: OWNER_ID }),
      body: noPet,
    });
    expect(res.status).toBe(400);
    expect(SchedulingService.createScheduling).not.toHaveBeenCalled();
  });

  it('admin passa direto: body preservado, resposta NÃO redigida', async () => {
    const res = await httpRequest(app, {
      method: 'POST',
      path: '/api/scheduling',
      token: adminToken(),
      body: { ...VALID, pet_owner_id: VICTIM_OWNER_ID, user_phone: '5511777777777' },
    });
    expect(res.status).toBe(201);
    const arg = SchedulingService.createScheduling.mock.calls[0][0].schedulingData;
    expect(arg[0].pet_owner_id).toBe(VICTIM_OWNER_ID); // admin não é sanitizado
    expect(arg[0].user_phone).toBe('5511777777777');
    expect(SchedulingService.petBelongsToOwner).not.toHaveBeenCalled();
    expect(res.body.data[0].petOwner.email).toBe('leak-victim@example.com'); // sem redação
  });
});
