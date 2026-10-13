// O reenvio do código da Petz pelo painel (`petz_force_connect`) fala com a chat-engine-v2.
//
// ── O ALCANCE ──────────────────────────────────────────────────────────────
// PEGA:
//   · 🚨 a URL voltar à v1 (`/functions/v1/chat-engine`), que vai ser apagada: o painel passaria a dar 404 no botão "Reenviar" sem
//     nenhum outro teste ficar vermelho;
//   · o corpo mudar (op, telefone, canal, mensagem do operador) ou o Bearer deixar de ser a service role;
//   · o contrato de resposta da v2 (`success`, `data.message`, `data.channel`) deixar de ser repassado ao operador.
// NÃO PEGA:
//   · o comportamento da op na v2 (armar a pendência, escolher template): é da EF e tem teste de paridade lá
//     (`chat-engine-v2/lib/ops-da-conexao-paridade.test.ts`).
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const query = vi.fn(async () => []);
vi.mock('../../config/database.js', () => ({ sequelize: { query: (...a) => query(...a) } }));

process.env.SUPABASE_URL = 'https://projeto-de-mentira.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-de-mentira';

const { sendCode } = await import('../services/marketplace-connection.service.js');

describe('🚨 sendCode posta na chat-engine-v2', () => {
  const original = globalThis.fetch;
  let chamadas;

  beforeEach(() => {
    chamadas = [];
    globalThis.fetch = vi.fn(async (url, init) => {
      chamadas.push({ url, init, body: JSON.parse(init.body) });
      return new Response(
        JSON.stringify({ success: true, data: { message: 'Seu código chegou 🐾', channel: 'sms' } }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    });
  });
  afterEach(() => {
    globalThis.fetch = original;
  });

  it('a URL é a da v2, nunca a da v1', async () => {
    await sendCode({ phone: '5531999300962', channel: 'sms' });
    expect(chamadas).toHaveLength(1);
    expect(chamadas[0].url).toBe('https://projeto-de-mentira.supabase.co/functions/v1/chat-engine-v2');
    // Controle: o literal da v1 (sem o sufixo) não pode aparecer como destino.
    expect(chamadas[0].url).not.toMatch(/\/functions\/v1\/chat-engine$/);
  });

  it('o corpo e o Bearer são os do contrato (op, telefone, canal, service role)', async () => {
    await sendCode({ phone: '5531999300962', channel: 'wpp' });
    expect(chamadas[0].body).toEqual({ operation: 'petz_force_connect', phone: '5531999300962', channel: 'wpp' });
    expect(chamadas[0].init.headers.Authorization).toBe('Bearer service-role-de-mentira');
  });

  it('o contrato de resposta da v2 chega ao operador', async () => {
    const r = await sendCode({ phone: '5531999300962', channel: 'sms' });
    expect(r).toMatchObject({ success: true, error: null, message: 'Seu código chegou 🐾', channel: 'sms' });
  });

  it('erro HTTP da v2 vira exceção com o status e a mensagem nomeando a v2', async () => {
    globalThis.fetch = vi.fn(async () => new Response('{}', { status: 502, headers: { 'Content-Type': 'application/json' } }));
    await expect(sendCode({ phone: '5531999300962', channel: 'sms' })).rejects.toMatchObject({
      status: 502,
      message: 'chat-engine-v2 retornou 502',
    });
  });
});
