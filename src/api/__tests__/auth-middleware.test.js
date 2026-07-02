// H-2 #5 — routeGuard era dead code quebrado (req.user.role?.toLowerCase() num
// role objeto → TypeError → 500 fail-closed). Foi removido. Este teste garante
// que o landmine sumiu e que checkRole (o guard de fato usado) lida com o role
// no formato objeto ({ role: 'x' }).
import { describe, it, expect, vi } from 'vitest';
import * as authMw from '../middlewares/auth.middleware.js';

const mockRes = () => {
  const res = {};
  res.status = vi.fn(() => res);
  res.json = vi.fn(() => res);
  return res;
};

describe('#5 — routeGuard removido + checkRole com role objeto', () => {
  it('routeGuard não é mais exportado (landmine removido)', () => {
    expect(authMw.routeGuard).toBeUndefined();
  });

  it('checkRole bloqueia role {role:"clinic"} fora da lista → 403 (não 500)', () => {
    const req = { user: { role: { role: 'clinic' } } };
    const res = mockRes();
    const next = vi.fn();
    authMw.checkRole(['admin', 'superAdmin'])(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('checkRole libera role {role:"admin"} na lista → next, sem 500', () => {
    const req = { user: { role: { role: 'admin' } } };
    const res = mockRes();
    const next = vi.fn();
    authMw.checkRole(['admin', 'superAdmin'])(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });
});
