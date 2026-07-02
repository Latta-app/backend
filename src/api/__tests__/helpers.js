// Helpers compartilhados da suite de authz (H-2).
// verifyToken lê process.env.JWT_SECRET em request-time, então fixamos o segredo
// aqui (import mais cedo) e assinamos os tokens de teste com o mesmo valor.
import http from 'node:http';
import jwt from 'jsonwebtoken';

export const TEST_SECRET = 'h2-authz-test-secret';
process.env.JWT_SECRET = TEST_SECRET;

export const signToken = (payload) => jwt.sign(payload, TEST_SECRET, { expiresIn: '1h' });

// role no JWT é objeto ({ role: 'x' }) — igual ao token real emitido por
// auth.service.generateToken (user.role é objeto no banco).
export const clinicToken = (over = {}) =>
  signToken({
    id: 'clinic-user-1',
    email: 'clinica@example.com',
    role: { role: 'clinic' },
    clinic_id: 'clinic-aaaa-1111',
    ...over,
  });

export const adminToken = (over = {}) =>
  signToken({ id: 'admin-1', email: 'admin@latta.com', role: { role: 'admin' }, ...over });

export const superAdminToken = (over = {}) =>
  signToken({ id: 'sa-1', email: 'sa@latta.com', role: { role: 'superAdmin' }, ...over });

export const petOwnerToken = (over = {}) =>
  signToken({
    id: 'owner-self-1',
    email: 'tutor@example.com',
    role: { role: 'petOwner' },
    ...over,
  });

// Dispara um request HTTP real contra o app Express (sem supertest): sobe um
// servidor efêmero, usa o fetch nativo do Node e fecha o servidor no fim.
export async function httpRequest(app, { method = 'GET', path = '/', token, body } = {}) {
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const { port } = server.address();
  try {
    const res = await fetch(`http://127.0.0.1:${port}${path}`, {
      method,
      headers: {
        'content-type': 'application/json',
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    let parsed;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      parsed = text;
    }
    return { status: res.status, body: parsed };
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}
