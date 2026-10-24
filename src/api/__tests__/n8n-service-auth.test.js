import { afterEach, describe, expect, it, vi } from 'vitest';
import { requireN8nServiceSecret } from '../middlewares/n8n-service-auth.middleware.js';

const rodar = (headers = {}) => {
  const req = { method: 'POST', originalUrl: '/n8n/x', ip: '1.1.1.1', get: (h) => headers[h] };
  const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
  const next = vi.fn();
  requireN8nServiceSecret(req, res, next);
  return { res, next };
};

describe('requireN8nServiceSecret', () => {
  afterEach(() => {
    delete process.env.N8N_ROUTE_AUTH;
    delete process.env.N8N_SERVICE_SECRET;
    vi.restoreAllMocks();
  });

  it('modo log deixa passar sem credencial', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    process.env.N8N_SERVICE_SECRET = 's';
    expect(rodar().next).toHaveBeenCalled();
  });

  it('enforce recusa sem header e com header errado', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    process.env.N8N_ROUTE_AUTH = 'enforce';
    process.env.N8N_SERVICE_SECRET = 's';
    for (const h of [{}, { 'x-n8n-secret': 'outro' }]) {
      const { res, next } = rodar(h);
      expect(res.status).toHaveBeenCalledWith(401);
      expect(next).not.toHaveBeenCalled();
    }
  });

  it('enforce sem secret configurado recusa tudo', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    process.env.N8N_ROUTE_AUTH = 'enforce';
    const { res } = rodar({ 'x-n8n-secret': '' });
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('enforce aceita o header certo', () => {
    process.env.N8N_ROUTE_AUTH = 'enforce';
    process.env.N8N_SERVICE_SECRET = 's';
    expect(rodar({ 'x-n8n-secret': 's' }).next).toHaveBeenCalled();
  });
});
