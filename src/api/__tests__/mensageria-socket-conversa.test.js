// O push `new_message` diz em qual CONVERSA a mensagem cai (numero-dedicado-b2b,
// fatia 08).
//
// O histórico grava NULL no número do tutor, e o painel não sabe qual é o id
// do número do tutor. Sem a conversa resolvida aqui, uma mensagem ao vivo da
// clínica no número novo pousaria na conversa de tutor da mesma pessoa (ou
// criaria uma terceira entrada) até o operador dar F5.
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../utils/staging-users.helper.js', () => ({ isQaPhone: vi.fn(async () => false) }));
vi.mock('../repositories/chat-history.repository.js', () => ({ default: {} }));
vi.mock('../../utils/s3.js', () => ({ default: { getObjectSignedUrl: vi.fn() } }));

import createSocketRoutes from '../routes/socket/socketRoutes.js';

const TUTOR = '587778224419344';
const ESTABELECIMENTO = '714853578383901';

const emitido = async (body) => {
  const emit = vi.fn();
  const io = { emit, to: vi.fn(() => ({ emit })), sockets: { adapter: { rooms: new Map() } } };
  const layer = createSocketRoutes(io).stack.find((l) => l.route?.path === '/webhook/new-message');
  const stack = layer.route.stack;
  const res = { status: vi.fn(() => res), json: vi.fn(() => res) };
  await stack[stack.length - 1].handle({ body }, res);
  return emit.mock.calls.find(([evento]) => evento === 'new_message')?.[1];
};

const base = { id: 'row-1', contact_id: 'c-1', cell_phone: '5531999990001', message: 'oi', journey: 'recebida' };

beforeEach(() => {
  process.env.WHATSAPP_PHONE_NUMBER_ID = TUTOR;
  process.env.WHATSAPP_B2B_PHONE_NUMBER_ID = ESTABELECIMENTO;
});

describe('new_message carrega a conversa', () => {
  it('mensagem no número do estabelecimento vai para a conversa do estabelecimento', async () => {
    const data = await emitido({ ...base, business_phone_number_id: ESTABELECIMENTO });

    expect(data).toMatchObject({ business_phone_number_id: ESTABELECIMENTO, conversa_id: `c-1:${ESTABELECIMENTO}` });
  });

  it('linha sem número é da conversa do tutor, com a mesma chave que a lista usa', async () => {
    const data = await emitido(base);

    expect(data).toMatchObject({ business_phone_number_id: TUTOR, conversa_id: `c-1:${TUTOR}` });
  });
});
