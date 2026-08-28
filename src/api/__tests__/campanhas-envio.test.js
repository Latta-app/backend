// O Destino: o payload, a idempotência e o que separa "falhou" de "não sei".
//
// ── O ALCANCE ──────────────────────────────────────────────────────────────
// PEGA:
//   · 🚨 retentar o que NÃO SE SABE se saiu. Timeout e queda de conexão não
//     dizem se a mensagem chegou na Meta: o request pode ter ido e a resposta
//     ter se perdido. Retentar isso é o jeito mais fácil de mandar duas vezes,
//     e desistir é o jeito mais fácil de não mandar. A linha tem que ficar
//     separada, esperando um humano;
//   · 🚨 a reserva sendo devolvida num incerto, que oferece a linha pra um
//     retry que pode duplicar;
//   · 🚨 o TELEFONE indo no botão da URL em vez do token. O link é publicado
//     pelo próprio tutor quando ele compartilha;
//   · 🚨 o carimbo `campanha|...` sumindo do chat_history — sem ele "quantos
//     receberam" só se responde de memória;
//   · o header indo por media_id em vez de link;
//   · disparo sem template ou sem endereço de página passando: o primeiro manda
//     mensagem sem texto, o segundo um botão que leva pro nada;
//   · 🚨 e o `is_being_attended` voltando pro caminho da campanha, que calaria
//     o bot pra todo mundo do lote sem nada devolver o flag depois.
// NÃO PEGA:
//   · se a Meta aceita o template — isso é a conta dela, e o preparo já recusa
//     template que não está APPROVED no banco;
//   · a atomicidade da reserva. Quem responde isso é o `FOR UPDATE SKIP LOCKED`,
//     provado direto contra prod num bloco que se desfez.
import { describe, it, expect, vi, beforeEach } from 'vitest';

const query = vi.fn(async () => []);
vi.mock('../../config/database.js', () => ({ sequelize: { query: (...a) => query(...a) } }));

const callMeta = vi.fn();
const logToHistory = vi.fn(async () => true);
vi.mock('../services/whatsapp-outbound.service.js', async (real) => {
  const modulo = await real();
  return {
    ...modulo,
    callMeta: (...a) => callMeta(...a),
    logToHistory: (...a) => logToHistory(...a),
  };
});

import { montarPayload, enviarUma, acharBotaoDeUrl } from '../services/campaign-send.service.js';
import { classificarFalha } from '../services/whatsapp-outbound.service.js';

describe('🚨 o payload leva a arte da pessoa e o token dela', () => {
  const base = {
    telefone: '5531999300962',
    templateNome: 'dia_do_cachorro_v2',
    arte: 'https://s3/campanhas/c1/p/abc123.jpg',
    valores: { 1: 'pro Bilbo', 2: 'dele' },
    token: 'abc123',
    slug: 'dia-do-cachorro',
  };

  it('o header vai por LINK, não por media_id', () => {
    // media_id exigiria subir cada peça pra Meta antes; a peça já está numa URL
    // que o proxy da landing serve. É como o Dia do Cachorro rodou.
    const h = montarPayload(base).template.components.find((c) => c.type === 'header');
    expect(h.parameters[0].image.link).toBe(base.arte);
    expect(h.parameters[0].image.id).toBeUndefined();
  });

  it('as variáveis do corpo vão na ORDEM das posições', () => {
    const b = montarPayload({ ...base, valores: { 2: 'dele', 1: 'pro Bilbo' } }).template.components.find(
      (c) => c.type === 'body',
    );
    // Fora de ordem, o tutor lê "eu fiz uma homenagem dele" — template válido,
    // envio 200, e o defeito só aparece no aparelho de quem recebeu.
    expect(b.parameters.map((p) => p.text)).toEqual(['pro Bilbo', 'dele']);
  });

  it('🚨 o botão leva o TOKEN, e nunca o telefone', () => {
    const btn = montarPayload({ ...base, botaoUrlIndice: '0' }).template.components.find(
      (c) => c.type === 'button',
    );
    expect(btn.parameters[0].text).toBe('abc123');
    expect(JSON.stringify(montarPayload(base))).not.toContain('t5531999300962');
  });

  it('sem token não monta botão, em vez de montar um que leva pro nada', () => {
    const semToken = montarPayload({ ...base, token: null, botaoUrlIndice: '0' });
    expect(semToken.template.components.find((c) => c.type === 'button')).toBeUndefined();
  });

  it('🚨 template SEM botão de URL não ganha componente de botão', () => {
    // Medido em 28/08: os dois templates do Dia do Cachorro aprovados usam
    // QUICK_REPLY. Mandar `sub_type: url` pra eles faz a Meta RECUSAR o envio
    // inteiro, e a recusa apareceria no primeiro disparo.
    const p = montarPayload({ ...base, botaoUrlIndice: null });
    expect(p.template.components.find((c) => c.type === 'button')).toBeUndefined();
  });
  it('o idioma vem do template, com pt_BR de reserva', () => {
    expect(montarPayload({ ...base, idioma: 'en_US' }).template.language.code).toBe('en_US');
    expect(montarPayload(base).template.language.code).toBe('pt_BR');
  });
});

describe('🚨 achar o botão de URL do template', () => {
  it('QUICK_REPLY não conta', () => {
    expect(
      acharBotaoDeUrl([{ type: 'BUTTONS', buttons: [{ type: 'QUICK_REPLY', text: 'Quero repostar' }] }]),
    ).toBe(null);
  });

  it('URL FIXA não conta: ela não aceita parâmetro', () => {
    expect(
      acharBotaoDeUrl([
        { type: 'BUTTONS', buttons: [{ type: 'URL', url: 'https://latta.app.br/loja' }] },
      ]),
    ).toBe(null);
  });

  it('URL com variável conta, e devolve o índice dela', () => {
    expect(
      acharBotaoDeUrl([
        {
          type: 'BUTTONS',
          buttons: [
            { type: 'QUICK_REPLY', text: 'x' },
            { type: 'URL', url: 'https://latta.app.br/dia-do-cachorro/{{1}}' },
          ],
        },
      ]),
    ).toBe('1');
  });

  it('template sem bloco de botões devolve nada', () => {
    expect(acharBotaoDeUrl([{ type: 'BODY', text: 'oi' }])).toBe(null);
    expect(acharBotaoDeUrl(null)).toBe(null);
  });

});

describe('🚨 falhou é diferente de não sei', () => {
  it('a Meta RECUSOU: dá pra retentar', () => {
    const r = classificarFalha({ response: { status: 400, data: { error: { message: 'bad param' } } } });
    expect(r.incerto).toBe(false);
    expect(r.motivo).toMatch(/400/);
  });

  it('🚨 TIMEOUT: não dá pra saber, e isso não é uma falha comum', () => {
    // O request pode ter chegado na Meta e a resposta ter se perdido. Tratar
    // como falha comum é retentar, e retentar aqui é mandar duas vezes.
    expect(classificarFalha({ code: 'ECONNABORTED', message: 'timeout' }).incerto).toBe(true);
  });

  it('🚨 ECONNRESET: também incerto', () => {
    expect(classificarFalha({ code: 'ECONNRESET' }).incerto).toBe(true);
  });
});

describe('o que fica gravado depois de mandar', () => {
  const peca = {
    id: 'peca-1',
    cell_phone: '5531999300962',
    pet_owner_id: 'owner-1',
    url: 'https://s3/arte.jpg',
    token: 'tok123',
  };
  const campanha = {
    id: 'camp-1',
    nome: 'Dia do Cachorro',
    templateNome: 'dia_do_cachorro_v2',
    slug: 'dia-do-cachorro',
  };
  const textoPorTelefone = new Map([
    ['5531999300962', { valores: { 1: 'pro Bilbo' }, texto: 'Oi, olha o Bilbo' }],
  ]);

  /** O último valor gravado em cada coluna, lendo os UPDATEs. */
  const gravado = () => {
    const estado = {};
    for (const [sql, opcoes] of query.mock.calls) {
      if (!/UPDATE campaign_pieces SET/.test(sql)) continue;
      Object.assign(estado, opcoes.replacements);
    }
    return estado;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    query.mockResolvedValue([]);
  });

  it('sucesso: grava enviado_em e o wamid', async () => {
    callMeta.mockResolvedValue({ messages: [{ id: 'wamid.XYZ' }] });
    const r = await enviarUma({ peca, campanha, textoPorTelefone });
    expect(r.ok).toBe(true);
    const e = gravado();
    expect(e.wamid).toBe('wamid.XYZ');
    expect(e.enviado_em).toBeInstanceOf(Date);
    expect(e.envio_incerto).toBe(false);
  });

  it('🚨 o chat_history leva o carimbo `campanha|...`', async () => {
    callMeta.mockResolvedValue({ messages: [{ id: 'wamid.XYZ' }] });
    await enviarUma({ peca, campanha, textoPorTelefone });
    const row = logToHistory.mock.calls[0][0];
    // Sem este carimbo, "quantos receberam" só se responde pela memória de quem
    // estava na frente da tela.
    expect(row.path).toBe('campanha|dia-do-cachorro|camp-1');
    expect(row.cell_phone).toBe('5531999300962');
    expect(row.message).toBe('Oi, olha o Bilbo');
    expect(row.message_id).toBe('wamid.XYZ');
  });

  it('🚨 o envio da campanha NÃO mexe em is_being_attended', async () => {
    // O sendTemplate do painel liga esse flag. Aqui seria desastre: o
    // chat-engine cala o bot enquanto ele estiver de pé, e nenhum código de
    // produção o volta pra false — só um humano, conversa por conversa.
    callMeta.mockResolvedValue({ messages: [{ id: 'w1' }] });
    await enviarUma({ peca, campanha, textoPorTelefone });
    const tudo = JSON.stringify(query.mock.calls) + JSON.stringify(logToHistory.mock.calls);
    expect(tudo).not.toMatch(/is_being_attended|setAttendance/);
  });

  it('recusa da Meta: devolve a reserva, pra dar pra retentar', async () => {
    callMeta.mockRejectedValue({ response: { status: 400, data: { error: { message: 'x' } } } });
    const r = await enviarUma({ peca, campanha, textoPorTelefone });
    expect(r.ok).toBe(false);
    expect(r.incerto).toBe(false);
    const e = gravado();
    expect(e.envio_reservado_em).toBe(null);
    expect(e.envio_incerto).toBe(false);
    expect(e.enviado_em).toBeUndefined();
  });

  it('🚨 incerto: a reserva FICA DE PÉ, pra ninguém retentar por engano', async () => {
    callMeta.mockRejectedValue({ code: 'ECONNRESET' });
    const r = await enviarUma({ peca, campanha, textoPorTelefone });
    expect(r.incerto).toBe(true);
    const e = gravado();
    expect(e.envio_incerto).toBe(true);
    // Soltar a reserva aqui seria oferecer a linha pra um retry que pode
    // duplicar. Ela só sai quando um humano disser o que aconteceu.
    expect(e.envio_reservado_em).toBeUndefined();
    expect(e.enviado_em).toBeUndefined();
  });

  it('falha não grava no chat_history: não houve mensagem', async () => {
    callMeta.mockRejectedValue({ response: { status: 400 } });
    await enviarUma({ peca, campanha, textoPorTelefone });
    expect(logToHistory).not.toHaveBeenCalled();
  });
});
