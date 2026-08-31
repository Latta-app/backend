/* ============================================================================
 * A FALA DA PROPOSTA — o agente conta a campanha em português de gente
 * ============================================================================
 *
 * 🚨 POR QUE ESTE ARQUIVO EXISTE. Até 31/08 a proposta do agente chegava na tela
 * assim:
 *
 *     você pediu   especie = Cat
 *     padrão       fotoEscopo = algum
 *     padrão       dedupNome = true
 *     padrão       escopo = tutor
 *
 * Isso é o formulário de novo, só que em outra fonte. O operador entrou numa
 * conversa pra NÃO ter que conhecer o nome das colunas, e a conferência devolvia
 * exatamente elas. Pior: `fotoEscopo = algum` não é conferível por ninguém que
 * não tenha lido o código. Uma linha que não dá pra conferir não é auditoria, é
 * enfeite de auditoria.
 *
 * A regra desta camada, e ela é dura: **se um valor não tem frase em português,
 * ele não aparece na tela.** Não existe fallback pra `campo = valor`. Um valor
 * novo sem frase quebra o guard aqui em vez de vazar cru pro operador, que é o
 * mesmo motivo do vocabulário fechado do briefing existir.
 *
 * 🚨 O QUE NÃO MUDA, e é o ponto: o que ficou no PADRÃO continua visível. A
 * troca é de linguagem e de forma, não de honestidade. Uma proposta que só
 * mostra o que o operador pediu esconde o que foi decidido por omissão, e é
 * justo aí que mora o disparo maior do que ele leu.
 * ============================================================================ */

/**
 * As frases de público, por campo e valor.
 *
 * Cada uma responde "quem entra e quem não entra", na língua de quem trabalha.
 * Nenhuma cita coluna, tabela ou nome de campo: quem quiser o detalhe técnico
 * abre a aba, onde ele está escrito de propósito.
 */
const FRASE_PUBLICO = {
  especie: {
    Dog: 'Só quem tem cachorro',
    Cat: 'Só quem tem gato',
    todas: 'Qualquer bicho da casa entra',
  },
  petVivo: {
    true: 'Pet que já partiu fica de fora',
  },
  petAtivo: {
    true: 'Cadastro de pet desativado fica de fora',
    false: 'Entra também quem tem o cadastro do pet desativado',
  },
  fotoPropria: {
    true: 'Só quem tem foto de verdade do pet',
    false: 'Entra também quem só tem o desenho da raça no lugar da foto',
  },
  fotoEscopo: {
    todos: 'Todo pet da casa precisa ter foto',
    algum: 'Basta um pet da casa ter foto',
  },
  dedupNome: {
    true: 'Pet cadastrado duas vezes conta como um só',
    false: 'Pet cadastrado duas vezes conta duas vezes',
  },
  personasTeste: {
    true: 'Os números de teste ficam de fora',
  },
  blacklist: {
    true: 'Quem pediu silêncio fica de fora',
  },
  // 🚨 Este não é regra que se liga e desliga: é o vínculo que já foi removido.
  // A frase existe porque o degrau aparece no funil, e um degrau sem frase
  // voltaria a ser nome de campo na tela.
  vinculoAtivo: {
    true: 'Quem saiu de perto do pet fica de fora',
  },
};

/**
 * 🚨 O VÍNCULO tem frase própria porque os valores dele são DADO, não lista.
 *
 * Os grupos abaixo são fixos. Qualquer outro valor é o nome de um tipo de
 * vínculo que existe no banco, e a frase sai do rótulo dele: escrever a lista à
 * mão aqui seria a nona forma do guard-álibi, defasando na primeira vez que
 * alguém cadastrar um tipo novo.
 */
const FRASE_VINCULO_GRUPO = {
  qualquer: 'Qualquer pessoa ligada ao pet, dono ou não',
  dono: 'Só quem é dono do pet',
  principal: 'Só o principal responsável pelo pet',
  cotutor: 'Só quem divide a tutela do pet',
};

/**
 * O rótulo do banco vem em caixa alta de título ("Rede de Apoio"), e a frase é
 * uma sentença. Sentence case é regra do guia de linguagem, então ele entra
 * minúsculo no meio da frase.
 */
export const fraseDoVinculo = (valor, rotulos = {}) =>
  FRASE_VINCULO_GRUPO[valor] ||
  (rotulos[valor] ? `Só quem entra como ${String(rotulos[valor]).toLowerCase()}` : null);

const FRASE_PRODUCAO = {
  escopo: {
    tutor: 'Uma peça por casa, com todos os pets dela',
    pet: 'Uma peça por animal',
  },
};

/**
 * Os dois campos de texto livre da Produção. Eles não têm valor fechado, então
 * a frase os EMOLDURA em vez de traduzi-los, e o caso vazio é dito em voz alta:
 * campo livre em branco é a lacuna mais fácil de passar batido.
 */
const MOLDURA_LIVRE = {
  descricaoFotos: {
    cheio: (v) => `A foto do pet entra assim: ${v}`,
    vazio: 'Sem instrução de como a foto do pet entra na arte',
  },
  textoDaArte: {
    cheio: (v) => `A arte já vem com a frase: ${v}`,
    vazio: 'Ninguém disse qual frase está escrita na arte',
  },
};

/**
 * A ABA que conserta cada decisão.
 *
 * 🚨 É isto que transforma a conferência em conversa: a linha não é só legível,
 * ela LEVA ao lugar de mudar. Sem o destino, o operador lê "só quem tem gato",
 * discorda, e tem que adivinhar em qual das sete abas aquilo mora.
 */
const ABA_DO_CAMPO = {
  especie: 'publico',
  petVivo: 'publico',
  petAtivo: 'publico',
  fotoPropria: 'publico',
  fotoEscopo: 'publico',
  vinculo: 'publico',
  vinculoAtivo: 'publico',
  dedupNome: 'publico',
  personasTeste: 'publico',
  blacklist: 'publico',
  escopo: 'producao',
  descricaoFotos: 'producao',
  textoDaArte: 'producao',
};

export const abaDoCampo = (campo) => ABA_DO_CAMPO[campo] ?? null;

/**
 * A frase de um campo, ou `null` quando não existe uma.
 *
 * 🚨 Devolver `null` é deliberado, e é o contrato inteiro. A tentação é cair num
 * `${campo} = ${valor}` quando falta tradução, e esse fallback é justamente o
 * defeito que este arquivo existe pra impedir: ele não quebra teste nenhum,
 * parece que funciona, e devolve a coluna crua pro operador. Quem chama trata o
 * `null` calando a linha, e o guard reprova o vocabulário que gerar um.
 */
export const fraseDoCampo = (campo, valor, { rotulosDeVinculo = {} } = {}) => {
  if (campo === 'vinculo') return fraseDoVinculo(valor, rotulosDeVinculo);

  const moldura = MOLDURA_LIVRE[campo];
  if (moldura) {
    const texto = String(valor ?? '').trim();
    return texto ? moldura.cheio(texto) : moldura.vazio;
  }

  const tabela = FRASE_PUBLICO[campo] ?? FRASE_PRODUCAO[campo];
  return tabela?.[String(valor)] ?? null;
};

/**
 * Como a decisão chegou ali, em duas palavras.
 *
 * 🚨 São DUAS, não três, e essa é a correção de 31/08. Antes eram "você pediu" e
 * "padrão", deduzidos de um campo `origem` que o próprio modelo declarava e que
 * errava nos dois sentidos: ele marcava como padrão o que tinha mudado, e o
 * código marcava como padrão o que ele tinha explicado. O rótulo passou a
 * contradizer a frase ao lado, no mesmo pixel.
 *
 * Agora só se afirma o que é verificável comparando com o padrão: ou o valor
 * mudou, ou ele ficou como sempre foi. A justificativa é sempre a do agente.
 */
export const COMO = { pedido: 'você pediu', assumido: 'assumi assim', sempre: 'isso é sempre assim' };

export default { fraseDoCampo, fraseDoVinculo, abaDoCampo, COMO };
