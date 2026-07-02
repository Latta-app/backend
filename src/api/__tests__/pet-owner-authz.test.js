// H-2 #1/#2 — /pet-owner/* precisa de checkRole excluindo 'clinic'.
// O controller/service/repo são mockados: só testamos os guards de role do
// arquivo de rotas (verifyToken + checkRole), não o acesso a dados.
import { describe, it, expect, beforeAll, vi } from 'vitest';
import express from 'express';
import { httpRequest, clinicToken, adminToken, superAdminToken, petOwnerToken } from './helpers.js';

// Substitui o controller inteiro — evita carregar service→repo→models→Sequelize.
// Cada handler devolve 200 pra distinguir "guard passou" de "guard bloqueou".
vi.mock('../controllers/pet-owner.controller.js', () => ({
  default: {
    createPetOwner: (req, res) => res.status(200).json({ reached: 'create' }),
    getAllPetOwners: (req, res) => res.status(200).json({ reached: 'getAll' }),
    getPetOwnerById: (req, res) => res.status(200).json({ reached: 'getById' }),
    updatePetOwner: (req, res) => res.status(200).json({ reached: 'update' }),
    deletePetOwner: (req, res) => res.status(200).json({ reached: 'delete' }),
    searchPetOwners: (req, res) => res.status(200).json({ reached: 'search' }),
  },
}));

let app;
beforeAll(async () => {
  const { default: petOwnerRoutes } = await import('../routes/private/pet-owners.routes.js');
  app = express();
  app.use(express.json());
  app.use('/api/pet-owner', petOwnerRoutes);
});

const ROUTES = [
  { method: 'POST', path: '/api/pet-owner', body: {} },
  { method: 'GET', path: '/api/pet-owner' },
  { method: 'GET', path: '/api/pet-owner/some-id' },
  { method: 'PUT', path: '/api/pet-owner/some-id', body: {} },
  { method: 'DELETE', path: '/api/pet-owner/some-id' },
  { method: 'GET', path: '/api/pet-owner/search/joao' },
];

describe('#1/#2 — /pet-owner authz', () => {
  it('bloqueia token de CLÍNICA com 403 em todas as 6 rotas', async () => {
    for (const r of ROUTES) {
      const res = await httpRequest(app, { ...r, token: clinicToken() });
      expect(res.status, `${r.method} ${r.path}`).toBe(403);
      expect(res.body.code, `${r.method} ${r.path}`).toBe('AUTH_FORBIDDEN');
    }
  });

  it('bloqueia token de petOwner com 403 (superfície é admin-only)', async () => {
    for (const r of ROUTES) {
      const res = await httpRequest(app, { ...r, token: petOwnerToken() });
      expect(res.status, `${r.method} ${r.path}`).toBe(403);
    }
  });

  it('retorna 401 sem token', async () => {
    const res = await httpRequest(app, { method: 'GET', path: '/api/pet-owner' });
    expect(res.status).toBe(401);
  });

  it('PERMITE admin e superAdmin (consumidores legítimos do painel)', async () => {
    for (const token of [adminToken(), superAdminToken()]) {
      for (const r of ROUTES) {
        const res = await httpRequest(app, { ...r, token });
        expect(res.status, `${r.method} ${r.path}`).toBe(200);
      }
    }
  });
});
