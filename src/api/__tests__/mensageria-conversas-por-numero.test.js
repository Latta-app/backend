// A lista da mensageria separa a mesma pessoa por número (numero-dedicado-b2b,
// fatia 08).
//
// ── O ALCANCE ──────────────────────────────────────────────────────────────
// PEGA:
//   · 🚨 uma pessoa que é tutor e clínica aparecendo como UMA conversa, com as
//     mensagens dos dois números misturadas numa linha do tempo só;
//   · a conversa de um número carregando mensagem do outro;
//   · o atendimento humano de uma conversa aparecendo na outra (a aba Luma
//     mostrando a conversa do tutor porque a da clínica foi assumida);
//   · o recorte das abas por conversa: Geral só com a do tutor, B2B com a do
//     estabelecimento (e a do tutor da clínica só antes da virada);
//   · o backend sem o número novo configurado mudando o que já existia;
//   · a FIAÇÃO do repositório: a query real pede as duas marcas de conversa e
//     as últimas mensagens de CADA número, e o escopo lê a coluna do
//     atendimento do estabelecimento.
// NÃO PEGA:
//   · se o SQL roda no Postgres de verdade (a suíte não tem banco); o texto é
//     conferido aqui e a execução fica para o smoke do operador.
import { describe, it, expect, vi, beforeEach } from 'vitest';

const TUTOR = '587778224419344';
const ESTABELECIMENTO = '714853578383901';
const PESSOA = '22222222-2222-2222-2222-222222222222';

// A lista pede as linhas (findAll, com os includes) e a contagem (count, SEM includes) em separado.
const listaDeContatos = vi.fn(async () => []);
const contagemDeContatos = vi.fn(async () => 0);
// As últimas mensagens dos contatos da página vêm de UMA consulta à parte (ChatHistory.findAll).
const mensagensDaLista = vi.fn(async () => []);
const findOne = vi.fn(async () => null);
const count = vi.fn(async () => 0);
vi.mock('../models/index.js', () => {
  const vazio = {};
  return {
    ChatHistory: { count: (...a) => count(...a), findAll: (...a) => mensagensDaLista(...a) },
    ChatHistoryContacts: vazio,
    Contact: {
      count: (...a) => contagemDeContatos(...a),
      findOne: (...a) => findOne(...a),
      findAll: (...a) => listaDeContatos(...a),
      sequelize: { query: vi.fn(async () => []) },
    },
    Order: { findAll: vi.fn(async () => []) },
    OrderItem: vazio,
    Pet: vazio,
    PetBreed: vazio,
    PetFurLength: vazio,
    PetGender: vazio,
    PetOwner: vazio,
    PetOwnerTag: vazio,
    PetSize: vazio,
    PetSubscription: vazio,
    PetType: vazio,
    Template: vazio,
    TemplateVariable: vazio,
    TemplateVariableType: vazio,
  };
});
vi.mock('../../utils/s3.js', () => ({ default: { getObjectSignedUrl: vi.fn() } }));
vi.mock('../../utils/staging-users.helper.js', () => ({ isStagingPhone: vi.fn(async () => true) }));

const { default: ChatRepository } = await import('../repositories/chat-history.repository.js');
const { default: ChatService } = await import('../services/chat-history.service.js');

/** Um contato como o Sequelize devolve: instância com `dataValues` e `get({ plain })`. */
const instancia = (plain) => {
  const dataValues = { ...plain };
  return {
    ...plain,
    dataValues,
    chatHistory: plain.chatHistory,
    get: () => ({ ...dataValues }),
  };
};

const msg = (id, numero, texto) => ({ id, business_phone_number_id: numero, message: texto, dataValues: {} });

/** A pessoa que é tutor (número do tutor) e clínica (número do estabelecimento). */
const tutorEClinica = (extra = {}) =>
  instancia({
    id: PESSOA,
    cellphone: '5531999990001',
    profile_name: 'Íris',
    is_being_attended: false,
    is_being_attended_b2b: false,
    tem_conversa_no_tutor: true,
    tem_conversa_no_estabelecimento: true,
    eh_clinica: true,
    chatHistory: [
      msg('m1', null, 'quero ração'),
      msg('m2', TUTOR, 'segue o link'),
      msg('m3', ESTABELECIMENTO, 'confirmo o horário'),
    ],
    ...extra,
  });

const listar = async (servico, contato) => {
  const spy = vi.spyOn(ChatRepository, servico === 'luma' ? 'getAllContactsBeingAttended' : 'getAllContactsWithMessages');
  spy.mockResolvedValueOnce({ contacts: [contato], totalItems: 1 });
  const vi_ = { role: 'admin', page: 1, limit: 15 };
  if (servico === 'geral') return (await ChatService.getAllContactsWithMessages(vi_)).contacts;
  if (servico === 'b2b') return (await ChatService.getAllB2bContacts(vi_)).contacts;
  if (servico === 'luma') return (await ChatService.getAllContactsBeingAttended(vi_)).contacts;
  if (servico === 'testes') return (await ChatService.getAllTestContacts(vi_)).contacts;
  throw new Error(servico);
};

beforeEach(() => {
  vi.restoreAllMocks();
  listaDeContatos.mockClear();
  contagemDeContatos.mockClear();
  mensagensDaLista.mockClear();
  findOne.mockClear();
  process.env.WHATSAPP_PHONE_NUMBER_ID = TUTOR;
  process.env.WHATSAPP_B2B_PHONE_NUMBER_ID = ESTABELECIMENTO;
  process.env.WHATSAPP_B2B_ENVIO_LIGADO = 'on';
});

describe('🚨 a mesma pessoa vira duas conversas, uma por número', () => {
  it('Testes (sem recorte): tutor e clínica aparecem como duas conversas, cada uma com as mensagens do seu número', async () => {
    const conversas = await listar('testes', tutorEClinica());

    expect(conversas.map((c) => [c.business_phone_number_id, c.publico_da_conversa])).toEqual([
      [TUTOR, 'tutor'],
      [ESTABELECIMENTO, 'estabelecimento'],
    ]);
    expect(conversas.map((c) => c.chatHistory.map((m) => m.id))).toEqual([['m1', 'm2'], ['m3']]);
    expect(new Set(conversas.map((c) => c.conversa_id)).size).toBe(2);
    expect(conversas.every((c) => c.id === PESSOA)).toBe(true);
  });

  it('a linha sem número é da conversa do tutor (o passado não muda de sentido)', async () => {
    const [tutor] = await listar('testes', tutorEClinica());

    expect(tutor.chatHistory.map((m) => m.message)).toContain('quero ração');
  });

  it('as marcas internas não vazam para o payload', async () => {
    const [tutor] = await listar('testes', tutorEClinica());

    expect(tutor).not.toHaveProperty('tem_conversa_no_estabelecimento');
    expect(tutor).not.toHaveProperty('eh_clinica');
    expect(tutor).not.toHaveProperty('is_being_attended_b2b');
  });
});

describe('🚨 o atendimento humano é da conversa', () => {
  it('assumida só a conversa da clínica: a Luma mostra só ela, e a Geral ainda mostra a do tutor', async () => {
    const assumida = { is_being_attended_b2b: true };

    const luma = await listar('luma', tutorEClinica(assumida));
    const geral = await listar('geral', tutorEClinica(assumida));

    expect(luma.map((c) => [c.business_phone_number_id, c.is_being_attended])).toEqual([[ESTABELECIMENTO, true]]);
    expect(geral.map((c) => [c.business_phone_number_id, c.is_being_attended])).toEqual([[TUTOR, false]]);
  });
});

describe('o recorte das abas por conversa', () => {
  it('Geral mostra só a conversa do tutor; B2B só a do estabelecimento (interruptor ligado)', async () => {
    expect((await listar('geral', tutorEClinica())).map((c) => c.business_phone_number_id)).toEqual([TUTOR]);
    expect((await listar('b2b', tutorEClinica())).map((c) => c.business_phone_number_id)).toEqual([ESTABELECIMENTO]);
  });

  it('antes da virada (interruptor desligado), a conversa da clínica no número do tutor ainda é B2B', async () => {
    process.env.WHATSAPP_B2B_ENVIO_LIGADO = 'off';

    expect((await listar('b2b', tutorEClinica())).map((c) => c.business_phone_number_id)).toEqual([
      TUTOR,
      ESTABELECIMENTO,
    ]);
  });

  it('tutor que escreveu no número novo por engano: a conversa dele lá é B2B, a de tutor não', async () => {
    const soTutor = tutorEClinica({ eh_clinica: false });

    expect((await listar('b2b', soTutor)).map((c) => c.business_phone_number_id)).toEqual([ESTABELECIMENTO]);
  });
});

describe('sem o número novo no backend, a lista é a de antes', () => {
  it('uma conversa por contato, no número do tutor, com todas as mensagens e sem recorte extra', async () => {
    delete process.env.WHATSAPP_B2B_PHONE_NUMBER_ID;
    const legado = instancia({
      id: PESSOA,
      cellphone: '5531999990001',
      is_being_attended: false,
      chatHistory: [msg('m1', null, 'oi'), msg('m2', null, 'olá')],
    });

    const conversas = await listar('b2b', legado);

    expect(conversas).toHaveLength(1);
    expect(conversas[0]).toMatchObject({ id: PESSOA, business_phone_number_id: TUTOR, publico_da_conversa: 'tutor' });
    expect(conversas[0].chatHistory.map((m) => m.id)).toEqual(['m1', 'm2']);
  });
});

describe('🚨 fiação: a query real do repositório', () => {
  const opcoesDaLista = async (fn = 'getAllContactsWithMessages', extra = {}) => {
    await ChatRepository[fn]({ role: 'admin', page: 1, limit: 15, ...extra });
    return listaDeContatos.mock.calls.at(-1)[0];
  };
  const sqlDe = (v) => {
    if (v == null) return '';
    if (typeof v === 'string') return v;
    if (typeof v !== 'object') return String(v);
    if (typeof v.val === 'string') return v.val;
    const partes = [];
    for (const k of Reflect.ownKeys(v)) partes.push(sqlDe(v[k]));
    return partes.join('\n');
  };

  it('a contagem da lista não leva os includes (custava 5,9s no Geral) e usa o mesmo escopo', async () => {
    for (const fn of ['getAllContactsWithMessages', 'getAllContactsBeingAttended']) {
      contagemDeContatos.mockClear();
      const opcoes = await opcoesDaLista(fn);
      const contagem = contagemDeContatos.mock.calls.at(-1)[0];

      expect(contagem.include).toBeUndefined();
      expect(contagem.distinct).toBe(true);
      expect(contagem.where).toBe(opcoes.where);
    }
  });

  // As últimas mensagens saem da consulta à parte (uma por página), e só rodam se a página tem contato.
  const sqlDasUltimasMensagens = async (fn = 'getAllContactsWithMessages') => {
    const contato = { id: PESSOA, dataValues: {} };
    listaDeContatos.mockResolvedValueOnce([contato]);
    await ChatRepository[fn]({ role: 'admin', page: 1, limit: 15 });
    const consulta = mensagensDaLista.mock.calls.at(-1)[0];
    return { contato, consulta, sql: sqlDe(consulta.where) };
  };

  it('pede as duas marcas de conversa', async () => {
    const opcoes = await opcoesDaLista();

    expect(opcoes.attributes.include.map(([, nome]) => nome)).toEqual([
      'tem_conversa_no_tutor',
      'tem_conversa_no_estabelecimento',
    ]);
    // O include correlacionado saiu: reexecutava por MENSAGEM (53s na aba Testers).
    expect(opcoes.include.find((i) => i.as === 'chatHistory')).toBeUndefined();
  });

  it('busca as últimas mensagens de CADA número numa consulta só, só dos contatos da página', async () => {
    for (const fn of ['getAllContactsWithMessages', 'getAllContactsBeingAttended']) {
      const { sql, consulta } = await sqlDasUltimasMensagens(fn);

      expect(sql).toContain('ROW_NUMBER() OVER');
      expect(sql).toContain(`PARTITION BY ch.contact_id, COALESCE(ch.business_phone_number_id = '${ESTABELECIMENTO}', false)`);
      expect(sql).toContain(`ch.contact_id IN ('${PESSOA}')`);
      expect(sql).toContain('posicao <= 6');
      expect(sql).not.toContain('"Contact"');
      expect(consulta.include.map((i) => i.as)).toEqual(['chatHistoryContacts', 'template']);
    }
  });

  it('o contato sai com as mensagens em chatHistory e em dataValues.chatHistory', async () => {
    const msg = { contact_id: PESSOA, id: 'm1', dataValues: { contact_id: PESSOA } };
    mensagensDaLista.mockResolvedValueOnce([msg]);
    const contato = { id: PESSOA, dataValues: {} };
    listaDeContatos.mockResolvedValueOnce([contato]);

    await ChatRepository.getAllContactsWithMessages({ role: 'admin', page: 1, limit: 15 });

    expect(contato.chatHistory).toEqual([msg]);
    expect(contato.dataValues.chatHistory).toEqual([msg]);
    expect(msg.dataValues.contact_id).toBeUndefined();
  });

  it('só confia em uuid na lista de contatos da consulta de mensagens', async () => {
    listaDeContatos.mockResolvedValueOnce([{ id: "x'); DROP TABLE contacts;--", dataValues: {} }]);
    await ChatRepository.getAllContactsWithMessages({ role: 'admin', page: 1, limit: 15 });

    expect(mensagensDaLista).not.toHaveBeenCalled();
  });

  it('a aba B2B também pergunta se a pessoa é clínica', async () => {
    const opcoes = await opcoesDaLista('getAllContactsWithMessages', { b2bFilter: 'only', testFilter: 'none' });

    expect(opcoes.attributes.include.map(([, nome]) => nome)).toContain('eh_clinica');
  });

  it('o escopo da Luma lê o atendimento da conversa do estabelecimento', async () => {
    const opcoes = await opcoesDaLista('getAllContactsBeingAttended');

    expect(sqlDe(opcoes.where)).toContain('c.is_being_attended_b2b = true');
  });

  it('sem o número novo, a query sai como antes: sem marcas, uma conversa só, sem a coluna nova', async () => {
    delete process.env.WHATSAPP_B2B_PHONE_NUMBER_ID;
    const opcoes = await opcoesDaLista();
    const { sql } = await sqlDasUltimasMensagens();

    expect(opcoes.attributes.include).toEqual([]);
    expect(sql).toContain('PARTITION BY ch.contact_id, false');
    expect(sql).not.toContain(ESTABELECIMENTO);
    expect(sqlDe(opcoes.where)).not.toContain('is_being_attended_b2b');
  });

  it('o detalhe de uma conversa filtra as mensagens pelo número dela', async () => {
    await ChatRepository.getContactByContactId({ contact_id: PESSOA, role: 'admin', numero: ESTABELECIMENTO });
    const opcoes = findOne.mock.calls.at(-1)[0];

    expect(sqlDe(opcoes.include.find((i) => i.as === 'chatHistory').where)).toContain(
      `AND ch.business_phone_number_id = '${ESTABELECIMENTO}'`,
    );
  });
});
