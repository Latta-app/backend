// A resposta da mensageria sai pelo número da CONVERSA (numero-dedicado-b2b,
// fatia 08).
//
// ── O ALCANCE ──────────────────────────────────────────────────────────────
// PEGA:
//   · 🚨 a operadora respondendo uma conversa do número do estabelecimento e a
//     Graph API sendo chamada com o phone_number_id do TUTOR. A clínica veria a
//     resposta noutra conversa, fora da janela de 24h dela;
//   · o painel antigo (sem número) mudando de comportamento: tem que continuar
//     saindo pelo número do tutor;
//   · um phone_number_id que não é da Latta sendo usado para enviar;
//   · 🚨 assumir a conversa da clínica calando a mesma pessoa como tutor, e o
//     contrário;
//   · o histórico do envio sem o número (a mensageria não saberia em qual
//     conversa pôr a resposta);
//   · a FIAÇÃO: rota real, controller real, service real, repositório real.
//     Só os models, o banco e o axios são dublês, e o que se afirma é a URL
//     que sai para a Meta.
// NÃO PEGA:
//   · se a coluna `is_being_attended_b2b` existe no banco. Ela nasce na
//     migration 20260927190800 do repo principal, que tem que estar aplicada
//     antes deste backend subir.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import { httpRequest, adminToken } from './helpers.js';

const TUTOR = '587778224419344';
const ESTABELECIMENTO = '714853578383901';
const CONTATO = '11111111-1111-1111-1111-111111111111';

const posts = [];
vi.mock('axios', () => ({
  default: {
    post: vi.fn(async (url, body) => {
      posts.push({ url, body });
      return { data: { messages: [{ id: 'wamid.X' }] } };
    }),
  },
}));

let contato;
const templateAprovado = {
  template_name: 'aviso_da_agenda',
  template_language: 'pt_BR',
  template_preview: 'Olá',
  variables: [],
};
vi.mock('../models/index.js', () => ({
  Contact: { findByPk: vi.fn(async () => contato) },
  PetOwner: { findByPk: vi.fn(async () => null) },
  Template: { findOne: vi.fn(async () => templateAprovado) },
  TemplateVariable: {},
  TemplateVariableType: {},
}));
vi.mock('../../config/database.js', () => ({ sequelize: { query: vi.fn(async () => []) } }));

const novoContato = () => ({
  id: CONTATO,
  cellphone: '5531999990001',
  pet_owner_id: null,
  clinic_id: null,
  is_being_attended: false,
  is_being_attended_b2b: false,
  save: vi.fn(async () => {}),
});

let app;
beforeEach(async () => {
  posts.length = 0;
  contato = novoContato();
  process.env.WHATSAPP_PHONE_NUMBER_ID = TUTOR;
  process.env.WHATSAPP_B2B_PHONE_NUMBER_ID = ESTABELECIMENTO;
  delete process.env.WHATSAPP_B2B_ENVIO_LIGADO;
  const { default: messagingRoutes } = await import('../routes/private/messaging.routes.js');
  const { default: contactRoutes } = await import('../routes/private/contact.routes.js');
  app = express();
  app.use(express.json());
  app.use('/api/messaging', messagingRoutes);
  app.use('/api/contacts', contactRoutes);
});

const paraMeta = () => posts.filter((p) => p.url.includes('graph.facebook.com'));
const paraHistorico = () => posts.filter((p) => p.url.includes('chat-history-logger'));
const numeroDaUrl = (url) => decodeURIComponent(url).match(/graph\.facebook\.com\/v[\d.]+\/(\d+)\/messages/)?.[1];

const responder = (body) =>
  httpRequest(app, { method: 'POST', path: '/api/messaging/send-text', token: adminToken(), body });

describe('🚨 a resposta sai pelo número da conversa', () => {
  it('conversa do número novo: a Graph API é chamada com o phone_number_id do estabelecimento', async () => {
    const res = await responder({ contact_id: CONTATO, message: 'Oi, clínica', business_phone_number_id: ESTABELECIMENTO });

    expect(res.status).toBe(200);
    expect(paraMeta().map((p) => numeroDaUrl(p.url))).toEqual([ESTABELECIMENTO]);
  });

  it('o interruptor desligado não muda a RESPOSTA: quem escreveu no número novo é respondido nele', async () => {
    process.env.WHATSAPP_B2B_ENVIO_LIGADO = 'off';
    await responder({ contact_id: CONTATO, message: 'Oi', business_phone_number_id: ESTABELECIMENTO });

    expect(paraMeta().map((p) => numeroDaUrl(p.url))).toEqual([ESTABELECIMENTO]);
  });

  it('conversa do número do tutor, e o painel antigo sem número, saem pelo número do tutor', async () => {
    await responder({ contact_id: CONTATO, message: 'Oi', business_phone_number_id: TUTOR });
    await responder({ contact_id: CONTATO, message: 'Oi de novo' });

    expect(paraMeta().map((p) => numeroDaUrl(p.url))).toEqual([TUTOR, TUTOR]);
  });

  it('um phone_number_id que não é da Latta é recusado com 400, antes de qualquer ida à Meta', async () => {
    const res = await responder({ contact_id: CONTATO, message: 'Oi', business_phone_number_id: '123456789' });

    expect(res.status).toBe(400);
    expect(posts).toEqual([]);
  });

  it('o histórico do envio grava o número da conversa (é por ele que a resposta cai na conversa certa)', async () => {
    await responder({ contact_id: CONTATO, message: 'Oi', business_phone_number_id: ESTABELECIMENTO });

    expect(paraHistorico().map((p) => p.body.business_phone_number_id)).toEqual([ESTABELECIMENTO]);
  });

  it('template e sugestão da IA também saem pelo número da conversa', async () => {
    await httpRequest(app, {
      method: 'POST',
      path: '/api/messaging/send-template',
      token: adminToken(),
      body: { contact_id: CONTATO, template_id: 't1', business_phone_number_id: ESTABELECIMENTO },
    });
    await httpRequest(app, {
      method: 'POST',
      path: '/api/messaging/send-ai-suggestion',
      token: adminToken(),
      body: { contact_id: CONTATO, message: 'Pode sim', business_phone_number_id: ESTABELECIMENTO },
    });

    expect(paraMeta().map((p) => numeroDaUrl(p.url))).toEqual([ESTABELECIMENTO, ESTABELECIMENTO]);
  });

  it('sem a env do número novo, o id dele não é da Latta para este backend e é recusado', async () => {
    delete process.env.WHATSAPP_B2B_PHONE_NUMBER_ID;
    const res = await responder({ contact_id: CONTATO, message: 'Oi', business_phone_number_id: ESTABELECIMENTO });

    expect(res.status).toBe(400);
    expect(posts).toEqual([]);
  });
});

describe('🚨 o atendimento humano vale por conversa', () => {
  it('responder a clínica no número novo assume SÓ a conversa do estabelecimento', async () => {
    await responder({ contact_id: CONTATO, message: 'Oi', business_phone_number_id: ESTABELECIMENTO });

    expect(contato.is_being_attended_b2b).toBe(true);
    expect(contato.is_being_attended).toBe(false);
  });

  it('responder no número do tutor assume SÓ a conversa do tutor', async () => {
    await responder({ contact_id: CONTATO, message: 'Oi', business_phone_number_id: TUTOR });

    expect(contato.is_being_attended).toBe(true);
    expect(contato.is_being_attended_b2b).toBe(false);
  });

  it('o botão de assumir na conversa da clínica não silencia a mesma pessoa como tutor', async () => {
    const res = await httpRequest(app, {
      method: 'PATCH',
      path: `/api/contacts/${CONTATO}/toggle-attendance`,
      token: adminToken(),
      body: { business_phone_number_id: ESTABELECIMENTO },
    });

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ business_phone_number_id: ESTABELECIMENTO, is_being_attended: true });
    expect(contato.is_being_attended).toBe(false);
  });

  it('o set explícito da conversa da clínica também só mexe nela', async () => {
    contato.is_being_attended = true;
    await httpRequest(app, {
      method: 'PATCH',
      path: `/api/contacts/${CONTATO}/attendance`,
      token: adminToken(),
      body: { is_being_attended: true, business_phone_number_id: ESTABELECIMENTO },
    });
    await httpRequest(app, {
      method: 'PATCH',
      path: `/api/contacts/${CONTATO}/attendance`,
      token: adminToken(),
      body: { is_being_attended: false, business_phone_number_id: ESTABELECIMENTO },
    });

    expect(contato.is_being_attended_b2b).toBe(false);
    expect(contato.is_being_attended).toBe(true);
  });
});

describe('o envio não tem número padrão', () => {
  it('callMeta sem o número da Latta que envia lança, em vez de cair no número do tutor', async () => {
    const { callMeta } = await import('../services/whatsapp-outbound.service.js');

    await expect(callMeta({ to: '5531999990001' })).rejects.toThrow(/phone_number_id/);
    expect(posts).toEqual([]);
  });
});
