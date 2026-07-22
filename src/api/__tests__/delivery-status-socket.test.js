// Rota /webhook/delivery-status — o push que faz o tick da bolha andar sem F5.
//
// O que estes testes travam (e por que): o UPDATE de delivery_status nao passa
// pelo `new_message`, entao esta rota e o UNICO caminho do status ate o painel
// aberto. Dois erros seriam invisiveis em prod e caros: (1) emitir na sala
// errada — status de tester vazando pro painel de prod, o mesmo bug que o
// `new_message` ja teve; (2) emitir sem `id`, que e a chave que o front usa pra
// achar a bolha (as msgs no state sao keyed pelo id da row, nao pelo wamid).
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../utils/staging-users.helper.js', () => ({
  isQaPhone: vi.fn(async () => false),
}));
vi.mock('../repositories/chat-history.repository.js', () => ({ default: {} }));
vi.mock('../../utils/s3.js', () => ({ default: { getObjectSignedUrl: vi.fn() } }));

import createSocketRoutes from '../routes/socket/socketRoutes.js';
import { isQaPhone } from '../../utils/staging-users.helper.js';

const makeIo = () => {
  const emit = vi.fn();
  return {
    emit,
    to: vi.fn(() => ({ emit })),
    sockets: { adapter: { rooms: new Map() } },
  };
};

const mockRes = () => {
  const res = {};
  res.status = vi.fn(() => res);
  res.json = vi.fn(() => res);
  return res;
};

// Pega o handler final da rota (pula o express.json(), que nao roda em teste —
// entregamos req.body ja parseado).
const routeHandler = (io, path) => {
  const router = createSocketRoutes(io);
  const layer = router.stack.find((l) => l.route?.path === path);
  const stack = layer.route.stack;
  return stack[stack.length - 1].handle;
};

const basePayload = {
  id: 'row-uuid-1',
  contact_id: 'contact-uuid-1',
  cell_phone: '5531999300962',
  message_id: 'wamid.ABC',
  delivery_status: 'read',
  delivery_error: null,
  delivery_updated_at: '2026-07-22T20:32:00.000Z',
};

beforeEach(() => vi.clearAllMocks());

describe('POST /webhook/delivery-status', () => {
  it('emite delivery_status_update na sala de prod pra telefone de cliente real', async () => {
    const io = makeIo();
    const res = mockRes();
    await routeHandler(io, '/webhook/delivery-status')({ body: basePayload }, res);

    expect(io.to).toHaveBeenCalledWith('messaging:prod');
    const [event, data] = io.emit.mock.calls[0];
    expect(event).toBe('delivery_status_update');
    expect(data).toMatchObject({
      id: 'row-uuid-1',
      contact_id: 'contact-uuid-1',
      message_id: 'wamid.ABC',
      delivery_status: 'read',
    });
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: true, room: 'messaging:prod' }),
    );
  });

  it('telefone QA vai pra sala homolog (nao vaza status de tester no painel de prod)', async () => {
    isQaPhone.mockResolvedValueOnce(true);
    const io = makeIo();
    await routeHandler(io, '/webhook/delivery-status')({ body: basePayload }, mockRes());

    expect(io.to).toHaveBeenCalledWith('messaging:homolog');
  });

  it('sem id (chave da bolha no front) → 400 e nada emitido', async () => {
    const io = makeIo();
    const res = mockRes();
    const { id, ...semId } = basePayload;
    await routeHandler(io, '/webhook/delivery-status')({ body: semId }, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(io.emit).not.toHaveBeenCalled();
  });

  it('sem delivery_status → 400 (evento vazio repintaria a bolha pra nada)', async () => {
    const io = makeIo();
    const res = mockRes();
    const { delivery_status, ...semStatus } = basePayload;
    await routeHandler(io, '/webhook/delivery-status')({ body: semStatus }, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(io.emit).not.toHaveBeenCalled();
  });

  it('delivery_error de falha viaja pro painel (tooltip do ⚠️ depende dele)', async () => {
    const io = makeIo();
    await routeHandler(io, '/webhook/delivery-status')(
      {
        body: {
          ...basePayload,
          delivery_status: 'failed',
          delivery_error: 'wa_131026: Message Undeliverable',
        },
      },
      mockRes(),
    );

    const [, data] = io.emit.mock.calls[0];
    expect(data.delivery_status).toBe('failed');
    expect(data.delivery_error).toBe('wa_131026: Message Undeliverable');
  });
});
