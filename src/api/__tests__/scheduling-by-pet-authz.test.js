// H-2 #4 (camada controller) — getSchedulingsByPet escopa por dono no repo.
// Verifica que o controller passa petOwnerId = req.user.id pra role petOwner e
// undefined pra admin (que vê tudo), e que clinic nem alcança a rota.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import express from 'express';
import { httpRequest, petOwnerToken, adminToken, clinicToken } from './helpers.js';

vi.mock('../services/scheduling.service.js', () => ({
  default: {
    getSchedulingsByPet: vi.fn(async () => [
      { id: 'a', pet_owner_id: 'someone-else', user_phone: '5511999999999' },
    ]),
  },
}));
vi.mock('../services/merchant-scheduling-agent.service.js', () => ({ default: {} }));
vi.mock('../services/clinic-activity-log.service.js', () => ({ logFromReq: vi.fn(), default: {} }));
vi.mock('../middlewares/clinic-portal-flag.middleware.js', () => ({
  requireClinicPortalFlag: (req, res, next) => next(),
  default: (req, res, next) => next(),
}));

const OWNER_ID = '33333333-3333-3333-3333-333333333333';

let app;
let SchedulingService;
beforeEach(async () => {
  vi.clearAllMocks();
  ({ default: SchedulingService } = await import('../services/scheduling.service.js'));
  const { default: schedulingRoutes } = await import('../routes/private/scheduling.routes.js');
  app = express();
  app.use(express.json());
  app.use('/api/scheduling', schedulingRoutes);
});

describe('#4 — getSchedulingsByPet scoping', () => {
  it('petOwner: repo é chamado com petOwnerId = req.user.id', async () => {
    const res = await httpRequest(app, {
      method: 'GET',
      path: '/api/scheduling/pet/PET1',
      token: petOwnerToken({ id: OWNER_ID }),
    });
    expect(res.status).toBe(200);
    expect(SchedulingService.getSchedulingsByPet).toHaveBeenCalledWith(
      expect.objectContaining({ petId: 'PET1', petOwnerId: OWNER_ID }),
    );
  });

  it('admin: repo é chamado sem escopo de dono (vê tudo)', async () => {
    const res = await httpRequest(app, {
      method: 'GET',
      path: '/api/scheduling/pet/PET1',
      token: adminToken(),
    });
    expect(res.status).toBe(200);
    const arg = SchedulingService.getSchedulingsByPet.mock.calls[0][0];
    expect(arg.petOwnerId).toBeUndefined();
  });

  it('clinic nem alcança a rota (403 no checkRole)', async () => {
    const res = await httpRequest(app, {
      method: 'GET',
      path: '/api/scheduling/pet/PET1',
      token: clinicToken(),
    });
    expect(res.status).toBe(403);
    expect(SchedulingService.getSchedulingsByPet).not.toHaveBeenCalled();
  });
});
