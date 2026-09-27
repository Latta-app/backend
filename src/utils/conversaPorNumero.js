// A CONVERSA da mensageria é o par (pessoa, número da Latta).
//
// Até o segundo número, conversa e contato eram a mesma coisa: um telefone, uma
// linha do tempo, um `is_being_attended`. Com o número do estabelecimento, a
// mesma pessoa pode ser tutor num número e clínica no outro. Misturar as duas
// numa linha do tempo só faz a operadora responder a clínica pelo número do
// tutor, e assumir uma conversa calava a Latta nas duas relações.
//
// Este módulo é PURO. As regras de número vêm de `numeroDoPublico.js`.

import { numeroDaConversa, publicoDoNumero } from './numeroDoPublico.js';

export class NumeroDaConversaInvalido extends Error {
  constructor(numero) {
    super(`business_phone_number_id ${numero} não é um número da Latta`);
    this.status = 400;
    this.code = 'INVALID_BUSINESS_PHONE_NUMBER_ID';
  }
}

/**
 * O número por onde a operadora responde numa conversa.
 *
 * Ausente = número do tutor (painel antigo e histórico sem número). Um id que
 * não é de número nenhum da Latta é RECUSADO: mandar por um phone_number_id
 * estranho não é resposta à conversa que a operadora está vendo.
 */
export const numeroDaRespostaDoPainel = (numeroPedido, n) => {
  const pedido = String(numeroPedido ?? '').trim();
  if (pedido && publicoDoNumero(pedido, n) === 'desconhecido') {
    throw new NumeroDaConversaInvalido(pedido);
  }
  const numero = numeroDaConversa(pedido || null, n);
  return { numero, publico: publicoDoNumero(numero, n) };
};

/** A coluna de `contacts` que guarda o atendimento humano da conversa naquele número. */
export const colunaDoAtendimento = (numero, n) =>
  publicoDoNumero(numero, n) === 'estabelecimento' ? 'is_being_attended_b2b' : 'is_being_attended';

/** A chave estável de uma conversa na lista (o front usa como `id` do item). */
export const chaveDaConversa = (contactId, numero) => `${contactId}:${numero}`;

const semValores = (row) => (row && typeof row.get === 'function' ? row.get({ plain: true }) : row);

/**
 * Parte UM contato da lista em uma entrada por conversa que a aba mostra.
 *
 * `contato` é o que o repositório devolve, com:
 *   · `chatHistory`: as últimas mensagens de CADA número (cada linha com
 *     `business_phone_number_id`);
 *   · `tem_conversa_no_tutor` / `tem_conversa_no_estabelecimento`: se existe
 *     alguma linha naquele número (o histórico inteiro, não só as carregadas);
 *   · `eh_clinica`: o telefone bate com uma `clinics` (só a aba B2B pergunta).
 *
 * `aba` é o recorte do escopo:
 *   · `atendidas: true`  → só conversas em atendimento humano (aba Luma);
 *   · `atendidas: false` → tira as conversas em atendimento humano (Geral, B2B);
 *   · `atendidas: null`  → não olha atendimento (Testes, Testers);
 *   · `b2b: 'only'`      → a conversa do estabelecimento sempre, e a do tutor
 *                          só de quem é clínica e com o envio pelo número novo
 *                          desligado (a clínica que ainda fala pelo número do
 *                          tutor, como antes da virada);
 *   · `b2b: 'exclude'`   → só a conversa do tutor;
 *   · `b2b: 'none'`      → as duas.
 *
 * Sem número do estabelecimento configurado, devolve o contato como UMA
 * conversa no número do tutor, sem recortar nada: o estado anterior ao
 * segundo número, em que o SQL já fez o recorte da aba.
 */
export const separarConversas = (contato, n, aba = {}) => {
  const c = semValores(contato);
  const mensagens = c.chatHistory || [];
  const { atendidas = null, b2b = 'none' } = aba;

  if (!n.estabelecimento) {
    // Um número só: a conversa é o contato, e o SQL já fez o recorte da aba.
    return [
      {
        ...c,
        conversa_id: chaveDaConversa(c.id, n.tutor),
        business_phone_number_id: n.tutor,
        publico_da_conversa: 'tutor',
        is_being_attended: c.is_being_attended === true,
      },
    ];
  }

  const numeros = [n.tutor, n.estabelecimento];
  const existe = {
    [n.tutor]: c.tem_conversa_no_tutor === true,
    [n.estabelecimento]: c.tem_conversa_no_estabelecimento === true,
  };
  // Enquanto o envio pelo número novo está desligado, a clínica ainda fala
  // pelo número do tutor, e essa conversa é B2B. Ligado, o número do tutor só
  // atende tutor.
  const clinicaNoNumeroDoTutor = !n.envioDoEstabelecimentoLigado;

  const atendida = (numero) =>
    colunaDoAtendimento(numero, n) === 'is_being_attended_b2b'
      ? c.is_being_attended_b2b === true
      : c.is_being_attended === true;

  const conversas = [];
  for (const numero of numeros) {
    if (!existe[numero]) continue;
    const publico = publicoDoNumero(numero, n);
    if (atendidas === true && !atendida(numero)) continue;
    if (atendidas === false && atendida(numero)) continue;
    if (b2b === 'exclude' && publico === 'estabelecimento') continue;
    if (b2b === 'only' && publico === 'tutor' && !(clinicaNoNumeroDoTutor && c.eh_clinica === true)) continue;

    const {
      tem_conversa_no_tutor: _t,
      tem_conversa_no_estabelecimento: _e,
      eh_clinica: _c,
      is_being_attended_b2b: _b,
      ...resto
    } = c;
    conversas.push({
      ...resto,
      conversa_id: chaveDaConversa(c.id, numero),
      business_phone_number_id: numero,
      publico_da_conversa: publico,
      is_being_attended: atendida(numero),
      chatHistory: mensagens.filter((m) => numeroDaConversa(m.business_phone_number_id, n) === numero),
    });
  }
  return conversas;
};

/** A aba, a partir dos parâmetros de escopo do repositório. */
export const abaDoEscopo = ({ beingAttended = false, testFilter = 'exclude', b2bFilter = 'exclude', stagingFilter = 'none' }) => {
  let atendidas = null;
  if (beingAttended) atendidas = true;
  else if (testFilter !== 'only' && stagingFilter !== 'only') atendidas = false;
  return { atendidas, b2b: b2bFilter || 'none' };
};

export default {
  NumeroDaConversaInvalido,
  numeroDaRespostaDoPainel,
  colunaDoAtendimento,
  chaveDaConversa,
  separarConversas,
  abaDoEscopo,
};
