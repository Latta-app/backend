// A tag do braço A/B do onboarding no painel da esquerda da mensageria
// (rodada onboarding-caminho-curto, fatia 13 — decisões do Lucas em 09/08/2026).
//
// ── O ALCANCE ──────────────────────────────────────────────────────────────
// PEGA:
//   · builder da lista que esqueça de enriquecer. São TRÊS alimentando a MESMA
//     lista da esquerda, e é o erro mais fácil de cometer aqui: mexer só no
//     getAllContactsWithMessages faz a tag sumir quando o operador digita na
//     busca, ou quando ele abre a aba "em atendimento";
//   · tag inventada pra quem não tem atribuição (os 132 contatos anteriores a
//     07/08/2026 — decisão: SEM tag, sem backfill);
//   · o telefone indo normalizado pro repository. A régua tem que ser a do SQL,
//     que espelha a da EF que ESCREVE. Normalizar em JS aqui, com um dos dois
//     normalizadores do backend, casaria telefone que a EF nunca atribuiu.
// NÃO PEGA:
//   · se o SQL do repository casa de fato (o repo é mockado). Isso foi medido à
//     mão contra prod em 09/08/2026: 12 dígitos e formato mascarado caem no
//     mesmo match via public.nudge_normalize_phone;
//   · se o chip renderiza bonito — é do frontend (ContactItem.jsx).
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../repositories/chat-history.repository.js', () => ({
  default: {
    getAllContactsWithMessages: vi.fn(),
    getAllContactsBeingAttended: vi.fn(),
    searchContacts: vi.fn(),
    findOnboardingArmsByPhones: vi.fn(async () => []),
    // Enriquecimento vizinho no MESMO seam (a janela de 24h). Sem o mock, o
    // service quebra aqui e a suíte da tag acusa um erro que não é dela.
    findLastInboundByPhones: vi.fn(async () => []),
    getReplyMessageById: vi.fn(async () => null),
  },
}));

vi.mock('../../utils/s3.js', () => ({ default: { getSignedUrl: vi.fn(async () => null) } }));

// Corta a cadeia service→models→config/database, que instancia o Sequelize com
// DATABASE_URL na importação. Teste hermético, sem Postgres nem rede (mesma
// régua da suíte de authz — ver vitest.config.js).
vi.mock('../models/index.js', () => ({
  ChatHistory: {},
  Contact: {},
}));

vi.mock('../../utils/staging-users.helper.js', () => ({
  isStagingPhone: vi.fn(async () => false),
}));

import ChatService from '../services/chat-history.service.js';
import ChatRepository from '../repositories/chat-history.repository.js';

/** Contato no formato que o service recebe do Sequelize (instância com dataValues). */
const contato = (cellphone) => {
  const dataValues = { cellphone, chatHistory: [] };
  return { cellphone, chatHistory: [], dataValues };
};

const ATRIBUICOES = [
  { raw: '5531991927909', variant: 'A', completed: false },
  { raw: '5531999155797', variant: 'B', completed: true },
];

beforeEach(() => {
  vi.clearAllMocks();
  ChatRepository.findOnboardingArmsByPhones.mockResolvedValue(ATRIBUICOES);
});

describe('tag do braço A/B — os TRÊS builders da lista da esquerda', () => {
  it('getAllContactsWithMessages carimba o braço', async () => {
    ChatRepository.getAllContactsWithMessages.mockResolvedValue({
      contacts: [contato('5531991927909')],
      totalItems: 1,
    });

    const { contacts } = await ChatService.getAllContactsWithMessages({ role: 'admin' });

    expect(contacts[0].dataValues.onboardingAb).toEqual({ arm: 'A', completed: false });
  });

  it('searchContacts carimba o braço (builder SEPARADO — a tag some na busca se esquecer)', async () => {
    ChatRepository.searchContacts.mockResolvedValue([contato('5531999155797')]);

    const contacts = await ChatService.searchContacts({ query: 'lucas', role: 'admin' });

    expect(contacts[0].dataValues.onboardingAb).toEqual({ arm: 'B', completed: true });
  });

  it('getAllContactsBeingAttended carimba o braço (aba "em atendimento")', async () => {
    ChatRepository.getAllContactsBeingAttended.mockResolvedValue({
      contacts: [contato('5531991927909')],
      totalItems: 1,
    });

    const { contacts } = await ChatService.getAllContactsBeingAttended({ role: 'admin' });

    expect(contacts[0].dataValues.onboardingAb).toEqual({ arm: 'A', completed: false });
  });
});

describe('tag do braço A/B — quem NÃO tem atribuição', () => {
  it('contato sem linha de atribuição fica SEM tag (não inventa "A")', async () => {
    ChatRepository.getAllContactsWithMessages.mockResolvedValue({
      contacts: [contato('5531988887777')],
      totalItems: 1,
    });

    const { contacts } = await ChatService.getAllContactsWithMessages({ role: 'admin' });

    expect(contacts[0].dataValues.onboardingAb).toBeUndefined();
  });

  it('lista inteira sem atribuição não quebra nem carimba nada', async () => {
    ChatRepository.findOnboardingArmsByPhones.mockResolvedValue([]);
    ChatRepository.getAllContactsWithMessages.mockResolvedValue({
      contacts: [contato('5531988887777'), contato('5531977776666')],
      totalItems: 2,
    });

    const { contacts } = await ChatService.getAllContactsWithMessages({ role: 'admin' });

    expect(contacts.map((c) => c.dataValues.onboardingAb)).toEqual([undefined, undefined]);
  });
});

describe('tag do braço A/B — a chave que vai pro repository', () => {
  it('manda o cellphone CRU, sem normalizar em JS (a régua única mora no SQL)', async () => {
    ChatRepository.getAllContactsWithMessages.mockResolvedValue({
      // 12 dígitos: a atribuição está gravada com 13. Quem resolve é o
      // nudge_normalize_phone dentro da query, não este service.
      contacts: [contato('553199192790')],
      totalItems: 1,
    });

    await ChatService.getAllContactsWithMessages({ role: 'admin' });

    expect(ChatRepository.findOnboardingArmsByPhones).toHaveBeenCalledWith(['553199192790']);
  });

  it('deduplica telefones e ignora contato sem cellphone', async () => {
    ChatRepository.getAllContactsWithMessages.mockResolvedValue({
      contacts: [contato('5531991927909'), contato('5531991927909'), contato(null)],
      totalItems: 3,
    });

    await ChatService.getAllContactsWithMessages({ role: 'admin' });

    expect(ChatRepository.findOnboardingArmsByPhones).toHaveBeenCalledWith(['5531991927909']);
  });

  it('lista vazia não chega a consultar o banco', async () => {
    ChatRepository.getAllContactsWithMessages.mockResolvedValue({ contacts: [], totalItems: 0 });

    await ChatService.getAllContactsWithMessages({ role: 'admin' });

    expect(ChatRepository.findOnboardingArmsByPhones).not.toHaveBeenCalled();
  });
});
