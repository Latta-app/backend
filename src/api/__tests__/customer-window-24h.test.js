// A janela de 24h do painel — a regra, e o fato de existir uma só.
//
// Rodada `mensageria-rodada-2026-08-25`, fatia 1a.
//
// ── O QUE ISTO PEGA ────────────────────────────────────────────────────────
//   · a volta da regra velha: contar navegação de Flow como mensagem do tutor.
//     Medido em prod (25/08/2026): 4.316 das ~5.400 linhas de inbound em 14
//     dias são `message_type='flow'`, e em NOVE das 14 falhas `wa_131047` de
//     30 dias o "último inbound" pela regra velha era uma linha de Flow —
//     numa delas o último inbound REAL era de treze dias antes;
//   · o filtro por wamid, que é o erro simétrico: tap de botão ABRE janela e
//     é logado SEM `message_id`;
//   · um SEGUNDO ESCRITOR da regra. Qualquer query nova em `src/` que compare
//     `sent_by` com 'latta' à mão reprova aqui — foi exatamente uma cópia sem
//     o filtro de tipo que fez o painel prometer janela aberta;
//   · builder da lista (são cinco alimentando a MESMA tela) que esqueça de
//     anexar a janela.
//
// ── O QUE ISTO NÃO PEGA ────────────────────────────────────────────────────
//   · se o SQL casa telefone de fato (o repository é mockado). Conferido à mão
//     contra prod em 25/08 com `public.normalize_br_phone`;
//   · o fechamento do Flow (`nfm_reply`), que É mensagem de verdade e renova a
//     janela na Meta, mas hoje não vira linha própria no `chat_history`. A
//     regra erra pra FECHADO nesse caso, de propósito — ver o cabeçalho de
//     `utils/customerWindow.js`. Fatia própria.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

vi.mock('../repositories/chat-history.repository.js', () => ({
  default: {
    getAllContactsWithMessages: vi.fn(),
    getAllContactsBeingAttended: vi.fn(),
    searchContacts: vi.fn(),
    findOnboardingArmsByPhones: vi.fn(async () => []),
    findLastInboundByPhones: vi.fn(async () => []),
    getReplyMessageById: vi.fn(async () => null),
  },
}));

vi.mock('../../utils/s3.js', () => ({ default: { getSignedUrl: vi.fn(async () => null) } }));
vi.mock('../models/index.js', () => ({ ChatHistory: {}, Contact: {} }));
vi.mock('../../utils/staging-users.helper.js', () => ({
  isStagingPhone: vi.fn(async () => false),
}));

import ChatService from '../services/chat-history.service.js';
import ChatRepository from '../repositories/chat-history.repository.js';
import {
  CUSTOMER_WINDOW_HOURS,
  INBOUND_ABRE_JANELA_SQL,
  decideJanela24h,
  ultimoInboundQueAbreJanelaSql,
} from '../../utils/customerWindow.js';

const H = 36e5;
const AGORA = Date.parse('2026-08-25T12:00:00.000Z');

const contato = (cellphone) => {
  const dataValues = { cellphone, chatHistory: [] };
  return { cellphone, chatHistory: [], dataValues };
};

beforeEach(() => {
  vi.clearAllMocks();
  ChatRepository.findLastInboundByPhones.mockResolvedValue([]);
  ChatRepository.findOnboardingArmsByPhones.mockResolvedValue([]);
});

describe('a conta pura', () => {
  it('dentro de 24h a janela está aberta', () => {
    const r = decideJanela24h(new Date(AGORA - 23.5 * H), AGORA);
    expect(r.aberta).toBe(true);
    expect(r.horas_desde).toBe(23.5);
  });

  it('exatamente 24h já está FECHADA — o limite não é inclusivo', () => {
    expect(decideJanela24h(new Date(AGORA - CUSTOMER_WINDOW_HOURS * H), AGORA).aberta).toBe(false);
  });

  it('sem inbound nenhum: fechada, e sem inventar instante', () => {
    const r = decideJanela24h(null, AGORA);
    expect(r).toEqual({ aberta: false, ultima_msg_tutor: null, horas_desde: null });
  });

  it('timestamp ilegível não vira janela aberta', () => {
    expect(decideJanela24h('nao-e-data', AGORA).aberta).toBe(false);
  });
});

describe('o predicado SQL — a regra, não a redação', () => {
  // Avalia o predicado como o Postgres avaliaria, contra linhas de verdade.
  // Comparar o TEXTO da cláusula seria álibi: uma reescrita equivalente
  // reprovaria, e uma cópia com a cláusula faltando passaria.
  const casa = (row) => {
    const expr = INBOUND_ABRE_JANELA_SQL.replace(
      /coalesce\(message_type, ''\)/g,
      "(message_type ?? '')",
    )
      .replace(/<>/g, '!==')
      .replace(/\bAND\b/g, '&&')
      .replace(/\bsent_by\b/g, 'row.sent_by')
      .replace(/\bmessage_type\b/g, 'row.message_type');
    // eslint-disable-next-line no-new-func
    return Function('row', `return ${expr};`)(row);
  };

  it('texto do tutor ABRE janela', () => {
    expect(casa({ sent_by: 'pet owner', message_type: 'text' })).toBe(true);
  });

  it('tap de botão ABRE janela (é mensagem de verdade, e vem SEM wamid)', () => {
    expect(casa({ sent_by: 'pet owner', message_type: 'interactive', message_id: null })).toBe(true);
  });

  it('navegação dentro do Flow NÃO abre janela', () => {
    expect(casa({ sent_by: 'pet owner', message_type: 'flow' })).toBe(false);
  });

  it('mensagem NOSSA nunca abre janela', () => {
    expect(casa({ sent_by: 'latta', message_type: 'text' })).toBe(false);
  });

  it('inbound sem message_type ainda abre janela (nulo não é "flow")', () => {
    expect(casa({ sent_by: 'pet owner', message_type: null })).toBe(true);
  });
});

describe('as DUAS fontes do instante', () => {
  const sql = ultimoInboundQueAbreJanelaSql(':phone');

  it('lê o chat_history com o filtro de tipo', () => {
    expect(sql).toContain('FROM chat_history');
    expect(sql).toContain(INBOUND_ABRE_JANELA_SQL);
  });

  it('lê TAMBÉM o ledger do gateway — é o único lugar onde o nfm_reply existe', () => {
    // Sem esta perna, a conta erra pra FECHADO em quem acabou de concluir um
    // Flow. Medido em 25/08: `5531993110587` tinha inbound de treze dias atrás
    // no chat_history e concluiu um Flow no mesmo dia.
    expect(sql).toContain('FROM incoming_messages');
  });

  it('combina por GREATEST — o ledger só EMPURRA a janela, nunca encurta', () => {
    // GREATEST no Postgres ignora NULL. É o que faz telefone anterior a 20/08
    // (quando o ledger nasceu) continuar respondendo pelo chat_history.
    expect(sql).toContain('GREATEST');
    expect(sql).not.toMatch(/\bLEAST\b|\bcoalesce\(\s*\(SELECT max\(im/i);
  });

  it('as duas pernas usam a MESMA régua de telefone', () => {
    // Réguas diferentes nos dois lados fariam o GREATEST comparar o inbound de
    // um tutor com o silêncio de outro.
    const usos = sql.match(/public\.normalize_br_phone\(:phone\)/g) || [];
    expect(usos.length).toBe(2);
  });
});

describe('a definição é UMA — ninguém escreve a regra à mão', () => {
  const SRC = path.resolve(process.cwd(), 'src');
  const DONO = path.join('utils', 'customerWindow.js');

  const arquivos = (dir) =>
    readdirSync(dir).flatMap((nome) => {
      const p = path.join(dir, nome);
      if (statSync(p).isDirectory()) return nome === '__tests__' ? [] : arquivos(p);
      return p.endsWith('.js') ? [p] : [];
    });

  // Sem lista de arquivos à mão: varre `src/` inteiro, então arquivo NOVO que
  // copie a regra reprova sozinho. Uma lista ficaria defasada em silêncio.
  const varrer = (regex) =>
    arquivos(SRC)
      .filter((p) => !p.endsWith(DONO) && regex.test(readFileSync(p, 'utf8')))
      .map((p) => path.relative(SRC, p));

  it('só o dono da regra compara `sent_by` com "latta" em SQL', () => {
    // Só a forma SQL (aspas simples do Postgres). `sent_by: 'petshop'` em
    // objeto JS é escrita de linha, não leitura de janela, e fica de fora.
    expect(varrer(/sent_by\s*(<>|!=|=)\s*'latta'/)).toEqual([]);
  });

  it('só o dono da regra lê o ledger do gateway', () => {
    // A segunda fonte tem a mesma armadilha da primeira: uma leitura solta de
    // `incoming_messages` em outro arquivo seria uma terceira definição de
    // janela, e ninguém veria.
    expect(varrer(/\bincoming_messages\b/)).toEqual([]);
  });
});

describe('os CINCO caminhos que alimentam a mesma tela', () => {
  const JANELA = [{ raw: '5531991927909', last_inbound: new Date(Date.now() - 2 * H).toISOString() }];

  const esperaJanela = (contato_) => {
    expect(contato_.dataValues.janela24h?.aberta).toBe(true);
    expect(contato_.dataValues.janela24h?.horas_desde).toBe(2);
  };

  beforeEach(() => {
    ChatRepository.findLastInboundByPhones.mockResolvedValue(JANELA);
  });

  it('listagem geral', async () => {
    ChatRepository.getAllContactsWithMessages.mockResolvedValue({
      contacts: [contato('5531991927909')],
      totalItems: 1,
    });
    const { contacts } = await ChatService.getAllContactsWithMessages({ role: 'admin' });
    esperaJanela(contacts[0]);
  });

  it('aba "em atendimento"', async () => {
    ChatRepository.getAllContactsBeingAttended.mockResolvedValue({
      contacts: [contato('5531991927909')],
      totalItems: 1,
    });
    const { contacts } = await ChatService.getAllContactsBeingAttended({ role: 'admin' });
    esperaJanela(contacts[0]);
  });

  it('busca (builder separado — a janela some na busca se esquecer)', async () => {
    ChatRepository.searchContacts.mockResolvedValue([contato('5531991927909')]);
    const contacts = await ChatService.searchContacts({ query: 'lucas', role: 'admin' });
    esperaJanela(contacts[0]);
  });

  it('detalhe por contact_id — é ELE que o painel carrega ao abrir a conversa', async () => {
    ChatRepository.getContactByContactId = vi.fn(async () => ({
      contact: contato('5531991927909'),
      hasMore: false,
    }));
    const r = await ChatService.getContactByContactId({ contact_id: 'x', role: 'admin' });
    esperaJanela(r.contact);
  });

  it('detalhe por pet_owner_id', async () => {
    ChatRepository.getContactByPetOwnerId = vi.fn(async () => ({
      contact: contato('5531991927909'),
      hasMore: false,
    }));
    const r = await ChatService.getContactByPetOwnerId({ pet_owner_id: 'x', role: 'admin' });
    esperaJanela(r.contact);
  });

  it('contato sem inbound que conte fica SEM a chave (o front cai no cálculo local)', async () => {
    ChatRepository.findLastInboundByPhones.mockResolvedValue([]);
    ChatRepository.getAllContactsWithMessages.mockResolvedValue({
      contacts: [contato('5531988887777')],
      totalItems: 1,
    });
    const { contacts } = await ChatService.getAllContactsWithMessages({ role: 'admin' });
    expect(contacts[0].dataValues.janela24h).toBeUndefined();
  });

  it('telefone conhecido SEM inbound nenhum vira janela fechada explícita', async () => {
    // `last_inbound: null` é resposta, não ausência: o SQL respondeu "esse
    // telefone não tem uma linha que conte". Fechada explícita é diferente de
    // "não sei", e é o que impede o front de mostrar tempo restante inventado.
    ChatRepository.findLastInboundByPhones.mockResolvedValue([
      { raw: '5531988887777', last_inbound: null },
    ]);
    ChatRepository.getAllContactsWithMessages.mockResolvedValue({
      contacts: [contato('5531988887777')],
      totalItems: 1,
    });
    const { contacts } = await ChatService.getAllContactsWithMessages({ role: 'admin' });
    expect(contacts[0].dataValues.janela24h).toEqual({
      aberta: false,
      ultima_msg_tutor: null,
      horas_desde: null,
    });
  });
});
