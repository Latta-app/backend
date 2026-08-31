/* ============================================================================
 * O BRIEFING — o operador descreve a campanha, o agente propõe as marcações
 * ============================================================================
 *
 * A troca de postura que isto existe pra fazer: o operador sai de **preencher
 * item a item** e entra em **conferir e corrigir**. Ele descreve o disparo em
 * uma caixa de texto, e a proposta chega com as abas de Público, Produção e
 * Template já marcadas.
 *
 * 🚨 A PROPOSTA NÃO APLICA NADA. Ela não salva campanha, não congela público,
 * não aprova direção e não gera peça. Ela PREENCHE FORMULÁRIO, e todo o resto
 * continua exigindo a mão do operador. Um agente que congela audiência sozinho
 * troca "deixei passar uma marcação" por "disparei pra lista errada", que é
 * pior — a segunda não tem tela de conferência depois.
 *
 * 🚨 E ELA SE EXPLICA EM PORTUGUÊS. Toda decisão sai com uma FRASE (não com o
 * nome do campo), com o porquê que o agente deu, e com a informação de se aquilo
 * mudou ou ficou como sempre fica. Sem isso a conferência é impossível: uma
 * proposta que parece completa esconde onde o agente ficou no default, e o
 * operador revisa o que está escrito em vez de revisar o que foi decidido por
 * omissão. O `naoDecidi` existe pelo mesmo motivo — silêncio não pode passar
 * por decisão.
 *
 * 🚨 O que ela NÃO faz mais é afirmar QUEM decidiu. O campo `origem`, que o
 * modelo declarava, errava nos dois sentidos, e o rótulo derivado dele
 * contradizia a frase ao lado no mesmo pixel. Ver `campaign-fala.service.js`.
 *
 * ── AS QUATRO TRAVAS ─────────────────────────────────────────────────────────
 *
 * 🚨🚨 Há quatro regras que o agente NUNCA pode propor desligar, por mais que o
 * briefing peça. Ele pode errar de muitas formas; estas quatro são as que
 * machucam gente de verdade, e nenhuma prosa vale abrir a cerca:
 *
 *   petVivo        desligar manda homenagem citando o pet que morreu
 *   blacklist      desligar escreve pra quem pediu silêncio
 *   personasTeste  desligar infla o número com destinatário que não existe
 *   exclusoes      o agente não inventa exclusão manual: ela guarda telefone e
 *                  um motivo escrito, e o motivo tem que ser de um humano
 *
 * Se o briefing pedir qualquer uma delas, a trava segura E APARECE na resposta,
 * em `travas`. O operador continua podendo desligar as três primeiras com a
 * própria mão, na aba — o que não existe é caminho de prosa pra isso.
 * ============================================================================ */

import { pedirJson } from './llm-json.service.js';
import { montarPublico, normalizarRegras, tiposDeVinculo } from './campaign-audience.service.js';
import { fraseDoCampo, abaDoCampo, E_TEXTO_LIVRE } from './campaign-fala.service.js';
import { GRUPOS_DE_VINCULO } from './campaign-audience.service.js';
import { getTemplateCatalog } from './template-catalog.service.js';
import { variaveisDoCorpo } from './campaign-template.service.js';

/**
 * 🚨 O VOCABULÁRIO É FECHADO, e é ele que impede o defeito mais silencioso
 * possível: o agente propor uma regra com nome plausível que não existe. Ela
 * não filtraria nada, o funil pareceria coerente, e o disparo sairia maior do
 * que o operador leu na tela. É a família do guard que nunca reprova.
 *
 * Os valores permitidos são os mesmos de `normalizarRegras`. Quem mexer lá tem
 * que mexer aqui — as duas listas descrevem o mesmo contrato.
 */
export const VOCABULARIO = {
  especie: {
    valores: ['Dog', 'Cat', 'todas'],
    descricao: 'espécie do pet. Vem do join em pet_types, não de coluna na tabela pets.',
  },
  petVivo: {
    valores: [true],
    travada: true,
    descricao: 'corta pet com data de falecimento. SEMPRE ligada.',
  },
  petAtivo: {
    valores: [true, false],
    descricao: 'corta cadastro de pet desativado.',
    avisoSeDesligada:
      'entra pet com cadastro desativado. Muita dessa gente já saiu, e a peça chega falando de um bicho que não está mais na ficha.',
  },
  fotoPropria: {
    valores: [true, false],
    descricao:
      'exige a foto real do pet (original_photo). Desligada, entra quem só tem a ilustração genérica da raça.',
    // 🚨 Este é o aviso que mais importa da lista. Medido em 28/08: o agente
    // desligou esta regra sozinho, a partir de um "manda pra todo mundo" que
    // falava da blacklist. Desligada, entram os breed-portraits — 37 dos 121
    // cachorros ativos — e a peça que promete "olha o seu cachorro" mostra o
    // desenho genérico da raça. É a foto de outro cachorro, e nada acusa.
    avisoSeDesligada:
      'entra quem só tem a ilustração genérica da raça, não a foto do próprio pet. Numa peça que mostra o animal da pessoa, isso é a foto de outro bicho.',
  },
  fotoEscopo: {
    valores: ['todos', 'algum'],
    descricao:
      '"todos" exige que todos os pets da casa tenham foto; "algum" basta um. Use "algum" quando a peça mostra um pet só.',
  },
  /**
   * 🚨 O ÚNICO CAMPO CUJOS VALORES SÃO DADO, e por isso `valores` é uma função.
   *
   * Os quatro grupos são fixos; os tipos de vínculo vêm de `pet_owner_types`, e
   * são sete em prod (principal, co-tutor, veterinário, rede de apoio,
   * passeador, cuidador, contato de emergência). Escrever os sete aqui à mão é
   * a forma de guard-álibi que defasa sozinha: o oitavo tipo cadastrado amanhã
   * deixaria de existir pro agente sem nada acusar.
   */
  vinculo: {
    valores: (tipos = []) => [
      ...Object.keys(GRUPOS_DE_VINCULO),
      ...tipos.map((t) => t.nome).filter((n) => !GRUPOS_DE_VINCULO[n]),
    ],
    descricao:
      'quem, das pessoas ligadas ao pet, recebe. "dono" é quem o pet é (o principal e o co-tutor); "qualquer" inclui também veterinário, passeador, cuidador e rede de apoio, que têm acesso ao pet mas não são donos dele. 🚨 "manda pra todo mundo" NÃO autoriza sair de "dono": quem fala isso está falando de não deixar tutor de fora, não de escrever pro veterinário sobre o cachorro de outra pessoa.',
    // 🚨 A TERCEIRA CATEGORIA, entre livre e travada: dá pra desligar, e o
    // estrago é dito em voz alta. Medido em 31/08, na conversa real: o agente
    // marcou "qualquer" a partir de um "manda pra todo mundo, sem exceção" que
    // falava da blacklist, e o público pulou de 69 pra 98. É o mesmo defeito de
    // 28/08 com `fotoPropria`, num campo novo, e a resposta é a mesma: ele PODE
    // escolher isso, o que não pode é o estrago ser silencioso.
    avisoSeValor: {
      qualquer:
        'entra também veterinário, passeador, cuidador e rede de apoio, que têm acesso ao pet mas não são donos dele. A peça chega falando "o seu cachorro" pra quem cuida do cachorro de outra casa.',
    },
  },
  dedupNome: {
    valores: [true, false],
    descricao: 'funde pets com o mesmo nome no mesmo tutor (cadastro duplicado).',
    avisoSeDesligada:
      'cadastro duplicado passa a contar duas vezes. A peça sai com o mesmo pet clonado lado a lado e o texto repete o nome dele.',
  },
  personasTeste: {
    valores: [true],
    travada: true,
    descricao: 'corta os telefones de teste (55000000000...). SEMPRE ligada.',
  },
  blacklist: {
    valores: [true],
    travada: true,
    descricao: 'corta quem pediu pra não ser incomodado. SEMPRE ligada.',
  },
};

export const TRAVAS = Object.entries(VOCABULARIO)
  .filter(([, v]) => v.travada)
  .map(([k]) => k);

const RECADO_DA_TRAVA = {
  petVivo:
    'não dá pra incluir pet que já morreu: a peça chegaria como homenagem a um animal que a pessoa perdeu.',
  blacklist:
    'quem pediu pra não ser incomodado continua fora. Essa decisão é da pessoa, não da campanha.',
  personasTeste:
    'os telefones de teste continuam fora: eles passam em todo critério e só inflam o número.',
};

const PRODUCAO_VOCABULARIO = {
  escopo: {
    valores: ['tutor', 'pet'],
    descricao: '"tutor" = uma peça por casa, com todos os pets dela. "pet" = uma peça por animal.',
  },
  descricaoFotos: {
    livre: true,
    descricao:
      'instrução pro modelo sobre o que fazer com a foto do pet: onde ele fica na cena, em que pose, o que preservar do fundo. Português, imperativo, específico.',
  },
  textoDaArte: {
    livre: true,
    descricao:
      'o texto que JÁ ESTÁ pintado no fundo. Não é escrito pelo modelo: serve pra conferir se saiu idêntico. Só preencha se o briefing disser qual é a frase.',
  },
};

/**
 * 🚨 QUANTAS PERGUNTAS O AGENTE PODE FAZER, e por que há um teto.
 *
 * Sem teto, um modelo prestativo pergunta tudo — e a conversa vira o formulário
 * que ela existia pra substituir, só que em prosa e mais lenta. Com teto, ele é
 * obrigado a escolher o que realmente muda o disparo e assumir o resto no
 * padrão, DIZENDO que assumiu.
 *
 * Três é o que cabe antes de virar interrogatório. O teto é imposto aqui, no
 * código, e não só pedido no prompt: prompt é pedido, código é regra.
 */
export const TETO_DE_PERGUNTAS = 3;

const SISTEMA_PUBLICO = `Você é o Agente de Campanha da Latta (marketplace pet brasileiro). O operador conversa com você pra montar um disparo de WhatsApp, e você propõe as marcações das abas.

Você faz DUAS coisas, e escolhe uma por vez:

A) PERGUNTAR, quando falta algo que muda QUEM RECEBE ou O QUE SAI.
   Pergunte uma coisa por vez, curto, na língua de quem trabalha (não cite nome de campo nem de coluna).
   🚨 Só vale perguntar o que muda o público ou a peça. Nunca pergunte o que você pode assumir no padrão e avisar depois.
   Exemplos do que MERECE pergunta: a espécie, se a peça é uma por casa ou uma por animal, qual é a frase escrita na arte.
   Exemplos do que NÃO merece: se deve cortar cadastro desativado, se deve fundir pet duplicado. Assuma o padrão.

B) PROPOR, quando já dá pra montar. Na dúvida entre perguntar e propor, PROPONHA: a proposta é conferida numa tela, e o operador corrige o que estiver torto.

REGRAS DURAS DA PROPOSTA:
- Escolha SOMENTE entre os valores permitidos. Nunca invente nome de regra nem valor.
- Só mude um campo se a conversa PEDIR aquilo. "Manda pra todo mundo" fala de quem pediu silêncio, e não autoriza mexer em foto, em cadastro desativado nem em duplicata. Na dúvida, deixe no padrão.
- 🚨 Se a conversa pedir pra desligar uma regra TRAVADA, marque ela como false mesmo assim. A trava segura e explica pro operador. Engolir o pedido em silêncio é pior: a pessoa achou que foi atendida.
- 🚨🚨 TODO campo que você MUDAR precisa de um "porque". Campo mudado sem porque aparece pro operador em âmbar, como mudança que ninguém soube explicar, e ele vai conferir uma coisa que você sabia justificar. Isso vale mais ainda quando ele pediu a mudança em uma frase só: escreva "você pediu" e repita o pedaço do pedido.
- 🚨 Para cada campo que você marcar, escreva em "porque" a frase de UMA LINHA que justifica aquilo, na língua de quem trabalha. Se foi a conversa que pediu, cite o pedaço dela ("você falou em tutores de gato"). Se você assumiu, diga que assumiu e por quê. NUNCA cite nome de campo, de coluna nem de tabela nessa frase: quem lê não conhece o banco, e uma justificativa que ele não consegue conferir é pior do que nenhuma.
- Não declare de onde a decisão veio. Quem compara com o padrão é o sistema, e ele faz isso melhor do que você. Sua parte é a justificativa.
- Se pedirem algo que você não consegue traduzir em campo nenhum, ponha em "naoDecidi" com a frase da pessoa. Nunca chute.
- "textoDaArte" só é preenchido se a conversa citar a frase que está na arte. Senão, vazio.
- Português do Brasil, sem travessão, frases curtas, presente do indicativo.

Responda APENAS JSON. Para perguntar:
{ "pergunta": "a pergunta, curta", "porque": "por que ela muda o disparo" }

Para propor:
{
  "nome": "nome curto da campanha",
  "entendi": "uma frase do que você entendeu",
  "publico": { "especie": "...", "petAtivo": true, "fotoPropria": true, "fotoEscopo": "...", "vinculo": "...", "dedupNome": true },
  "publicoPorque": { "especie": {"porque":"você falou em tutores de gato"} },
  "producao": { "escopo": "...", "descricaoFotos": "...", "textoDaArte": "" },
  "producaoPorque": { "escopo": {"porque":"você pediu uma peça por casa"} },
  "pagina": { "kicker": "rótulo curto em caixa alta", "titulo": "...", "instrucao": "uma frase dizendo o que fazer", "botao": "texto do botão" },
  "buscaTemplate": "3 a 6 palavras que descrevem a mensagem, pra procurar o template",
  "naoDecidi": ["..."]
}`;

const SISTEMA_TEMPLATE = `Você escolhe o template de WhatsApp já APROVADO que melhor serve uma campanha, e mapeia as variáveis dele.

REGRAS DURAS:
- Escolha um template da lista dada. NUNCA invente nome de template.
- Se nenhum servir, devolva "nome": null e explique em "porque".
- Para cada {{n}} do corpo escolhido, diga de onde sai o valor. Fontes possíveis:
    "tutor"          primeiro nome do tutor
    "tutor_completo" nome completo do tutor
    "pets"           os nomes dos pets, já juntados ("Bilbo e Vamp")
    "genero"         uma palavra que concorda com o gênero do pet
    "fixo"           texto igual pra todo mundo (então informe "texto")
- Na fonte "genero" você escreve QUATRO formas: m (um macho), f (uma fêmea), mp (vários, ao menos um macho), fp (várias, todas fêmeas).
  Dentro de cada forma valem as marcações {pets} e {tutor}. Exemplo: "pro {pets}" vira "pro Bilbo", e "pras {pets}" vira "pras Ursa e Mel".
  🚨 NÃO existe plural automático em português ("cão" vira "cães"), então escreva as quatro à mão.
  🚨 O gênero vem do CADASTRO do pet, nunca do nome dele. Você nunca decide o gênero de ninguém: só escreve as formas.
- Português do Brasil, sem travessão.

Responda APENAS JSON:
{
  "nome": "nome_tecnico_do_template" | null,
  "porque": "por que este e não os outros",
  "alternativas": [{"nome":"...","porque":"..."}],
  "variaveis": { "1": {"fonte":"genero","m":"pro {pets}","f":"pra {pets}","mp":"pros {pets}","fp":"pras {pets}"}, "2": {"fonte":"tutor"} },
  "naoDecidi": ["..."]
}`;

const texto = (v) => String(v ?? '').trim();

/**
 * 🚨 O QUE É PADRÃO, e por que esta tabela existe aqui.
 *
 * Espelha os defaults de `normalizarRegras`. Ela é o que permite CALCULAR a
 * origem de cada decisão em vez de acreditar no que o modelo disse — ver abaixo.
 * Quem mexer nos defaults de lá tem que mexer aqui.
 */
const PADRAO_DO_CAMPO = {
  especie: 'Dog',
  petVivo: true,
  petAtivo: true,
  fotoPropria: true,
  fotoEscopo: 'todos',
  // 🚨 Mudou de 'qualquer' pra 'dono' em 31/08, junto com `normalizarRegras`.
  // As duas tabelas descrevem o mesmo contrato e defasam em silêncio: um padrão
  // aqui diferente do de lá faz toda proposta sair marcada como "você pediu"
  // sem ninguém ter pedido nada.
  vinculo: 'dono',
  dedupNome: true,
  personasTeste: true,
  blacklist: true,
  escopo: 'tutor',
  descricaoFotos: '',
  textoDaArte: '',
};

/**
 * Uma decisão auditável: a FRASE, se ela mudou, e o porquê que o agente deu.
 *
 * ── 🚨 O QUE ESTAVA ERRADO AQUI ATÉ 31/08, e eram dois defeitos ─────────────
 *
 * 1. A JUSTIFICATIVA BOA ERA JOGADA FORA. Quando o valor diferia do padrão e o
 *    modelo não tinha marcado `origem: 'briefing'`, o código SUBSTITUÍA o
 *    `porque` dele pelo texto de suspeita. O briefing dizia "pros tutores de
 *    gato", o modelo escrevia isso, e a tela dizia que ele não soube explicar.
 *    Ele soube. O código apagou, e apagou justamente a frase que fazia a
 *    conferência valer a pena.
 *
 * 2. O RÓTULO CONTRADIZIA O TEXTO AO LADO. O rótulo saía de comparar com o
 *    padrão; a frase vinha do modelo. Quando ele pedia "uma peça por casa" e
 *    isso por acaso ERA o padrão, a linha saía como "padrão" com a frase "pediu
 *    'uma peça por casa'" grudada nela. Duas afirmações opostas no mesmo pixel.
 *
 * ── O CONSERTO ──────────────────────────────────────────────────────────────
 *
 * 🚨 PAREI DE PERGUNTAR A ORIGEM AO MODELO. O campo `origem` era pouco confiável
 * NOS DOIS SENTIDOS: ele marcava como padrão o que tinha mudado (medido em
 * 28/08) e o código marcava como padrão o que ele tinha explicado (medido em
 * 31/08). Um dado que erra nas duas direções não melhora a auditoria, ele
 * inventa uma terceira história.
 *
 * Agora só se afirma o que dá pra verificar aqui dentro, comparando com o
 * padrão: **mudou** ou **ficou como sempre foi**. A justificativa é SEMPRE a
 * frase do agente, sem reescrita. E a suspeita ficou pro único caso em que ela
 * é honesta: mudou e não veio frase NENHUMA. Aí não há o que preservar, e
 * "confira" é a coisa certa a dizer.
 */
const decisao = (campo, valor, porqueBruto, opcoes = {}) => {
  // 🚨 A BASE DA COMPARAÇÃO É A CAMPANHA ABERTA, quando existe uma.
  //
  // Com uma campanha na tela, "mudou" só quer dizer alguma coisa em relação ao
  // que ESTÁ SALVO nela. Comparar com o padrão global diria "mudou" sobre um
  // valor que a pessoa escolheu semana passada e o agente não encostou, e diria
  // "como sempre" sobre uma troca que ele acabou de fazer. O selo voltaria a
  // contar uma história diferente da que aconteceu, que é o defeito de 31/08
  // noutra forma.
  const base = opcoes.base ?? PADRAO_DO_CAMPO;
  const padrao = base[campo] ?? PADRAO_DO_CAMPO[campo];
  const mudou = padrao !== undefined && valor !== padrao;
  const dele = texto(porqueBruto?.porque);

  // 🚨 Mudou e ninguém explicou. Este é o caso que merece âmbar, e só ele: não
  // há frase pra preservar, então dizer "confira" não apaga informação nenhuma.
  //
  // 🚨 Texto livre fica FORA do âmbar. O padrão dele é vazio, então qualquer
  // frase "mudou", e o alerta disparava justo em cima do que o operador tinha
  // acabado de ditar: em 31/08 a linha "A arte já vem com a frase: Feliz dia do
  // gato" saiu marcada como mudança inexplicada. Alerta que aparece sempre
  // deixa de ser alerta.
  const semExplicacao = mudou && !dele && !E_TEXTO_LIVRE(campo);

  return {
    campo,
    valor,
    frase: fraseDoCampo(campo, valor, opcoes),
    aba: abaDoCampo(campo),
    mudou,
    como: mudou ? 'pedido' : 'assumido',
    ...(semExplicacao ? { suspeita: true } : {}),
    porque:
      dele ||
      (mudou
        ? opcoes.base
          ? 'isso mudou em relação ao que já estava salvo e o agente não disse por quê. Confira.'
          : 'isso mudou em relação ao de sempre e o agente não disse por quê. Confira.'
        : opcoes.base
          ? 'ninguém mexeu nisso, então ficou como já estava na campanha'
          : 'ninguém falou disso na conversa, então ficou como sempre fica'),
  };
};

/**
 * 🚨 A PORTA ESTREITA. Tudo que o modelo devolveu passa por aqui, e só sai o que
 * o vocabulário reconhece.
 *
 * O que ele inventou não vira regra: vira uma linha em `ignorei`, que aparece na
 * tela. Descartar em silêncio seria trocar um defeito barulhento (regra
 * desconhecida) por um mudo (regra que sumiu), e o mudo é o que passa batido.
 */
export const normalizarPublico = (bruto, { tipos = [], aberta = null } = {}) => {
  const proposto = bruto?.publico ?? {};
  const porques = bruto?.publicoPorque ?? {};
  const rotulosDeVinculo = Object.fromEntries(tipos.map((t) => [t.nome, t.rotulo]));
  // 🚨 Com uma campanha aberta, ela vira a base da comparação. Ver `decisao`.
  const opcoesDeFrase = { rotulosDeVinculo, ...(aberta ? { base: aberta } : {}) };
  const valoresDe = (spec) => (typeof spec.valores === 'function' ? spec.valores(tipos) : spec.valores);
  const regras = {};
  const decisoes = [];
  const travas = [];
  const ignorei = [];
  // 🚨 Regra que o operador PODE desligar, mas cujo estrago não pode ser
  // silencioso. A trava é uma cerca; isto é uma placa. A diferença importa: o
  // operador tem o direito de deixar entrar quem só tem a ilustração da raça, e
  // não tem como saber o que isso faz com a peça se ninguém disser.
  const avisos = [];

  for (const [campo, spec] of Object.entries(VOCABULARIO)) {
    const veio = proposto[campo];

    if (spec.travada) {
      // A trava não discute: o valor é sempre o seguro. Mas se o agente tentou
      // mexer, isso é dito em voz alta — é a diferença entre uma cerca e um
      // filtro silencioso.
      regras[campo] = true;
      if (veio === false) travas.push({ campo, recado: RECADO_DA_TRAVA[campo] });
      // 🚨 A trava também é uma DECISÃO, e ela passou a aparecer em 31/08. Antes
      // as três só existiam na tela quando o agente tentava desligá-las, o que
      // deixava a leitura mais tranquila do que a verdade: uma proposta lida de
      // cima a baixo não dizia que o pet falecido estava fora. "Está sempre
      // ligado" é informação, e é ela que faz o operador não procurar o
      // interruptor.
      decisoes.push({
        campo,
        valor: true,
        frase: fraseDoCampo(campo, true, opcoesDeFrase),
        aba: abaDoCampo(campo),
        mudou: false,
        como: 'sempre',
        porque: RECADO_DA_TRAVA[campo],
      });
      continue;
    }

    // 🚨 CAMPO QUE O AGENTE NÃO CITOU ENTRA NA LISTA MESMO ASSIM. Ele decidiu
    // por omissão, e omissão é decisão: era a lacuna que fazia uma proposta
    // parecer mais completa do que era.
    //
    // 🚨 E o valor de encosto é o da CAMPANHA ABERTA, não o padrão global. Sem
    // isto, pedir "muda o público pra gato" numa campanha aberta devolveria os
    // outros nove campos ao default e desfaria em silêncio o que a pessoa tinha
    // marcado à mão. Mudança pedida em uma coisa não mexe nas outras.
    const encosto = aberta?.[campo] ?? PADRAO_DO_CAMPO[campo];

    if (veio !== undefined && !valoresDe(spec).includes(veio)) {
      ignorei.push(`${campo}: "${veio}" não é um valor que existe, então ficou o padrão`);
      regras[campo] = encosto;
      decisoes.push(decisao(campo, encosto, null, opcoesDeFrase));
      continue;
    }

    const usado = veio === undefined ? encosto : veio;
    regras[campo] = usado;
    decisoes.push(decisao(campo, usado, porques[campo], opcoesDeFrase));
    if (veio === undefined) continue;
    if (veio === false && spec.avisoSeDesligada) {
      avisos.push({ campo, recado: spec.avisoSeDesligada });
    }
    if (spec.avisoSeValor?.[veio]) {
      avisos.push({ campo, recado: spec.avisoSeValor[veio] });
    }
  }

  // 🚨 O PAR CONTRADITÓRIO. Sem foto própria exigida, o escopo da foto não
  // decide nada, e as duas linhas juntas se desmentiam na tela: "entra também
  // quem só tem o desenho da raça" seguido de "todo pet da casa precisa ter
  // foto". Saiu assim da conversa real de 31/08. Some a linha que não vale, em
  // vez de deixar o operador escolher em qual acreditar.
  const decisoesVisiveis =
    regras.fotoPropria === false ? decisoes.filter((d) => d.campo !== 'fotoEscopo') : decisoes;

  for (const campo of Object.keys(proposto)) {
    if (!VOCABULARIO[campo]) ignorei.push(`${campo} não é uma regra que existe por aqui`);
  }

  // 🚨 O agente NUNCA propõe exclusão manual. Ela guarda telefone e um motivo
  // escrito, e o motivo existe pra ser auditável seis meses depois — escrito por
  // máquina ele vira exatamente o álibi que a coluna NOT NULL tenta impedir.
  const normalizadas = normalizarRegras({ ...regras, exclusoes: [] });
  return { regras: normalizadas, decisoes: decisoesVisiveis, travas, avisos, ignorei };
};

export const normalizarProducao = (bruto, { aberta = null } = {}) => {
  const proposto = bruto?.producao ?? {};
  const porques = bruto?.producaoPorque ?? {};
  const valores = { tipo: 'gerar' };
  const decisoes = [];
  const ignorei = [];
  const opcoes = aberta ? { base: aberta } : {};
  // Mesma regra do público: o que o agente não citou volta ao que a campanha
  // já tem, e só cai no padrão global quando não há campanha aberta.
  const encosto = (campo, cair) => aberta?.[campo] ?? cair;

  const escopo = proposto.escopo;
  const escopoPadrao = encosto('escopo', 'tutor');
  valores.escopo = PRODUCAO_VOCABULARIO.escopo.valores.includes(escopo) ? escopo : escopoPadrao;
  if (escopo && valores.escopo !== escopo) {
    ignorei.push(`escopo: "${escopo}" não existe, então ficou "${escopoPadrao}"`);
  }
  decisoes.push(decisao('escopo', valores.escopo, porques.escopo, opcoes));

  valores.descricaoFotos =
    proposto.descricaoFotos === undefined
      ? texto(encosto('descricaoFotos', ''))
      : texto(proposto.descricaoFotos);
  decisoes.push(decisao('descricaoFotos', valores.descricaoFotos, porques.descricaoFotos, opcoes));

  valores.textoDaArte =
    proposto.textoDaArte === undefined
      ? texto(encosto('textoDaArte', ''))
      : texto(proposto.textoDaArte);
  decisoes.push(decisao('textoDaArte', valores.textoDaArte, porques.textoDaArte, opcoes));

  return { valores, decisoes, ignorei };
};

/**
 * A lista curta de templates que o agente considera.
 *
 * 221 aprovados não cabem num prompt sem diluir a escolha. O recorte é por
 * sobreposição de palavras com o briefing, e ele é DITO na resposta: o operador
 * precisa saber que a escolha foi entre N e não entre todos, senão ele confia
 * numa varredura que não aconteceu.
 */
export const encurtarCatalogo = (catalogo, termos, limite = 20) => {
  const palavras = [
    ...new Set(
      texto(termos)
        .toLowerCase()
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .split(/[^a-z0-9]+/)
        .filter((p) => p.length > 2),
    ),
  ];

  const pontuar = ([nome, t]) => {
    const alvo = `${nome} ${t.label ?? ''} ${t.body ?? ''}`
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '');
    return palavras.reduce((n, p) => n + (alvo.includes(p) ? 1 : 0), 0);
  };

  return Object.entries(catalogo)
    .map((e) => ({ entrada: e, pontos: pontuar(e) }))
    .filter((x) => x.pontos > 0)
    .sort((a, b) => b.pontos - a.pontos || a.entrada[0].localeCompare(b.entrada[0]))
    .slice(0, limite)
    .map(({ entrada: [nome, t] }) => ({
      nome,
      rotulo: t.label || nome,
      categoria: t.category,
      corpo: t.body,
      posicoes: variaveisDoCorpo(t.body),
    }));
};

/**
 * O endereço da página de compartilhamento.
 *
 * 🚨 O slug é DERIVADO do nome, e sai daqui sem acento, sem espaço e sem
 * maiúscula. Ele vira caminho de URL e nome de pasta no repo da landing: um
 * slug com acento funciona no navegador e quebra no `_redirects`, e o sintoma é
 * a arte não carregar pra ninguém.
 */
export const slugDaPagina = (nome) =>
  texto(nome)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);

export const normalizarPagina = (bruto, nomeDaCampanha) => ({
  slug: slugDaPagina(bruto?.slug || nomeDaCampanha),
  kicker: texto(bruto?.kicker),
  titulo: texto(bruto?.titulo),
  instrucao: texto(bruto?.instrucao),
  botao: texto(bruto?.botao) || 'Compartilhar a imagem',
});

const FONTES_VALIDAS = ['tutor', 'tutor_completo', 'pets', 'genero', 'fixo'];

/**
 * 🚨 A variável só passa se a fonte existir E se a posição existir no corpo.
 *
 * Fonte inventada resolveria pra string vazia e mandaria "Oi , tudo bem?" — o
 * template continua válido, o envio dá 200, e o defeito só aparece na tela de
 * quem recebeu.
 */
export const normalizarVariaveis = (bruto, posicoes) => {
  const variaveis = {};
  const ignorei = [];
  for (const [n, cfg] of Object.entries(bruto ?? {})) {
    if (!posicoes.includes(String(n))) {
      ignorei.push(`{{${n}}} não existe no corpo deste template`);
      continue;
    }
    if (!FONTES_VALIDAS.includes(cfg?.fonte)) {
      ignorei.push(`{{${n}}}: a fonte "${cfg?.fonte ?? 'nenhuma'}" não existe`);
      continue;
    }
    variaveis[n] = { ...cfg };
  }
  const faltando = posicoes.filter((p) => !variaveis[p]).map((p) => `{{${p}}} ficou sem fonte`);
  return { variaveis, ignorei, faltando };
};

/**
 * A campanha aberta, contada nas MESMAS frases que o operador lê.
 *
 * 🚨 Ela vai pro prompt assim, e não como o jsonb cru, por dois motivos que são
 * o mesmo motivo. Primeiro: um modelo que raciocina sobre `fotoEscopo: "algum"`
 * devolve justificativa citando `fotoEscopo`, e a frase que sobra na tela volta
 * a ser nome de campo — o defeito que esta rodada consertou na outra ponta.
 * Segundo: a tabela de frases já existe e é a única fonte de como cada valor se
 * chama em português. Duas descrições do mesmo estado divergiriam.
 */
export const resumoDaCampanha = (aberta, tipos = []) => {
  const rotulosDeVinculo = Object.fromEntries(tipos.map((t) => [t.nome, t.rotulo]));
  const campos = [...Object.keys(VOCABULARIO), 'escopo', 'descricaoFotos', 'textoDaArte'];
  const de = { ...(aberta?.regras ?? {}), ...(aberta?.producao ?? {}) };
  return campos
    .map((campo) => fraseDoCampo(campo, de[campo], { rotulosDeVinculo }))
    .filter(Boolean);
};

/**
 * O briefing inteiro: duas idas ao modelo, e o funil rodado de verdade no fim.
 *
 * 🚨 São duas idas de propósito. A segunda recebe o CORPO REAL dos templates
 * candidatos, e é isso que faz o mapeamento de `{{1}}` ser sobre o texto que
 * existe em vez de sobre um texto imaginado. Numa ida só, o modelo escolhe o
 * template e mapeia as variáveis dele no mesmo fôlego, sem nunca ter lido o
 * corpo — e o mapa sai plausível e errado.
 */
export const proporCampanha = async ({ briefing, mensagens, campanhaAberta }) => {
  const pedido = texto(briefing);
  if (!pedido) throw new Error('Escreva o briefing antes de pedir a proposta.');
  const conversa = Array.isArray(mensagens) ? mensagens : [];

  /**
   * 🚨 A CAMPANHA ABERTA, quando existe uma.
   *
   * Até 31/08 o agente propunha SEMPRE do zero: abrir uma campanha montada e
   * dizer "muda o público pra gato" gerava uma proposta que mexia em tudo, e as
   * outras nove marcações voltavam ao default sem ninguém pedir. Ele não estava
   * errando de vez em quando, ele nunca soube que havia uma campanha.
   *
   * Com ela, três coisas mudam: o prompt vê o estado atual, o encosto de cada
   * campo é o valor salvo (não o default), e o selo compara com o que está
   * salvo. As três dizem a mesma coisa: mudança pedida em uma coisa não mexe
   * nas outras.
   */
  const aberta = campanhaAberta?.regras ? campanhaAberta : null;
  const baseDoPublico = aberta?.regras ?? null;
  const baseDaProducao = aberta?.producao ?? null;

  // 🚨 Os tipos de vínculo saem do banco, não de uma lista aqui. Se a consulta
  // falhar, sobram os quatro grupos: o agente perde a chance de recortar por
  // "só veterinário" e não perde nada mais. Derrubar a proposta inteira por
  // causa disso seria trocar uma proposta boa por nenhuma.
  let tipos = [];
  try {
    tipos = await tiposDeVinculo();
  } catch {
    tipos = [];
  }

  const vocabularioPraPrompt = JSON.stringify(
    {
      publico: Object.fromEntries(
        Object.entries(VOCABULARIO).map(([k, v]) => [
          k,
          {
            valores: typeof v.valores === 'function' ? v.valores(tipos) : v.valores,
            travada: !!v.travada,
            o_que_faz: v.descricao,
          },
        ]),
      ),
      producao: Object.fromEntries(
        Object.entries(PRODUCAO_VOCABULARIO).map(([k, v]) => [
          k,
          { valores: v.valores ?? 'texto livre', o_que_faz: v.descricao },
        ]),
      ),
    },
    null,
    1,
  );

  // 🚨 O TETO É IMPOSTO AQUI, não só pedido no prompt. Contando as perguntas que
  // o agente já fez, o código decide se ele ainda PODE perguntar. Prompt é
  // pedido; código é regra, e a diferença aparece justo no modelo prestativo que
  // quer confirmar mais uma coisinha.
  const jaPerguntou = conversa.filter((m) => m?.papel === 'agente' && m?.pergunta).length;
  const podePerguntar = jaPerguntou < TETO_DE_PERGUNTAS;

  const { json: bruto } = await pedirJson({
    marca: 'campanhas/briefing',
    system: SISTEMA_PUBLICO,
    user: [
      `Campos e valores permitidos:\n${vocabularioPraPrompt}`,
      `Conversa até agora:\n${
        conversa.length
          ? conversa.map((m) => `${m.papel === 'agente' ? 'VOCÊ' : 'OPERADOR'}: ${texto(m.texto)}`).join('\n')
          : `OPERADOR: ${pedido}`
      }`,
      // 🚨 A campanha aberta entra no prompt EM PORTUGUÊS, pelas mesmas frases
      // que o operador lê. Mandar o jsonb cru faria o modelo raciocinar sobre
      // nome de campo e devolver justificativa citando nome de campo, que é o
      // defeito que esta rodada inteira consertou noutra ponta.
      aberta
        ? [
            `🚨 JÁ EXISTE UMA CAMPANHA ABERTA, chamada "${texto(campanhaAberta.nome) || 'sem nome'}", e ela está assim hoje:`,
            resumoDaCampanha(aberta, tipos)
              .map((l) => `  - ${l}`)
              .join('\n'),
            'O operador está AJUSTANDO essa campanha, não criando outra. Mude SOMENTE o que ele pedir agora e devolva o resto exatamente como está acima. Mexer no que ninguém citou desfaz em silêncio o que ele marcou à mão.',
          ].join('\n')
        : 'Não há campanha aberta: isto é uma campanha nova.',
      podePerguntar
        ? `Você já fez ${jaPerguntou} de ${TETO_DE_PERGUNTAS} perguntas. Pergunte só se faltar algo que muda quem recebe ou o que sai; senão, proponha.`
        : `🚨 Você já fez ${jaPerguntou} perguntas, que é o limite. AGORA VOCÊ TEM QUE PROPOR. O que faltar, assuma no padrão e liste em "naoDecidi".`,
    ].join('\n\n'),
  });

  // Pergunta acima do teto é descartada e vira proposta na próxima ida. Sem
  // isto, o teto do prompt seria uma sugestão e a conversa não terminaria.
  if (bruto?.pergunta && podePerguntar) {
    return {
      tipo: 'pergunta',
      pergunta: texto(bruto.pergunta),
      porque: texto(bruto.porque),
      restam: TETO_DE_PERGUNTAS - jaPerguntou - 1,
    };
  }

  const publico = normalizarPublico(bruto, { tipos, aberta: baseDoPublico });
  const producao = normalizarProducao(bruto, { aberta: baseDaProducao });

  // ── O template, com a lista curta ─────────────────────────────────────────
  let template = { nome: null, variaveis: {}, candidatos: [], ignorei: [], faltando: [] };
  let consideramos = 0;
  let noCatalogo = 0;
  try {
    const catalogo = await getTemplateCatalog();
    noCatalogo = Object.keys(catalogo).length;
    const curta = encurtarCatalogo(catalogo, `${pedido} ${texto(bruto?.buscaTemplate)}`);
    consideramos = curta.length;

    if (curta.length) {
      const { json: escolha } = await pedirJson({
        marca: 'campanhas/briefing-template',
        system: SISTEMA_TEMPLATE,
        user: `Briefing:\n"""${pedido}"""\n\nTemplates aprovados que podem servir:\n${JSON.stringify(
          curta.map((t) => ({ nome: t.nome, categoria: t.categoria, corpo: t.corpo })),
          null,
          1,
        )}\n\nEscolha um e mapeie as variáveis dele.`,
      });

      const escolhido = curta.find((t) => t.nome === escolha?.nome) ?? null;
      if (escolha?.nome && !escolhido) {
        template.ignorei.push(
          `a IA sugeriu o template "${escolha.nome}", que não está na lista de aprovados`,
        );
      }
      // O porquê vale MESMO quando não escolheu nada: "nenhum destes serve pra
      // gato" é a informação que faz o operador saber o que procurar na aba, em
      // vez de olhar 221 templates sem pista.
      if (!escolhido) template.porque = texto(escolha?.porque);
      if (escolhido) {
        const v = normalizarVariaveis(escolha?.variaveis, escolhido.posicoes);
        template = {
          nome: escolhido.nome,
          rotulo: escolhido.rotulo,
          corpo: escolhido.corpo,
          porque: texto(escolha?.porque),
          variaveis: v.variaveis,
          ignorei: [...template.ignorei, ...v.ignorei],
          faltando: v.faltando,
          candidatos: (Array.isArray(escolha?.alternativas) ? escolha.alternativas : [])
            .filter((a) => curta.some((t) => t.nome === a?.nome))
            .slice(0, 3),
        };
      }
    }
  } catch (e) {
    // O template é a parte opcional da proposta: sem ele o operador ainda ganha
    // o Público e a Produção prontos. Derrubar tudo por causa desta ida seria
    // trocar uma proposta parcial por nenhuma.
    template.ignorei.push(`não deu pra escolher o template agora (${texto(e.message)})`);
  }

  // ── O funil, rodado de verdade ────────────────────────────────────────────
  // 🚨 Sem isto a proposta é uma opinião. Com isto ela é uma opinião com o
  // número ao lado, e o operador confere a CONSEQUÊNCIA das marcações em vez de
  // conferir as marcações. É read-only: não congela nada.
  const resultado = await montarPublico(publico.regras);

  const paginaProposta = normalizarPagina(bruto?.pagina, texto(bruto?.nome));

  const naoDecidi = [
    ...(Array.isArray(bruto?.naoDecidi) ? bruto.naoDecidi.map(texto).filter(Boolean) : []),
    ...template.faltando,
    ...(template.nome ? [] : ['qual template usar. Escolha na aba Template.']),
    ...(producao.valores.textoDaArte ? [] : ['o texto que está escrito na arte.']),
    // 🚨 A pergunta que o teto engoliu vira lacuna declarada. Descartá-la em
    // silêncio seria trocar uma pergunta a mais por um default que ninguém viu.
    ...(bruto?.pergunta ? [`ele ainda queria perguntar: ${texto(bruto.pergunta)}`] : []),
    ...(paginaProposta.titulo ? [] : ['o texto da pagina de compartilhamento. Escreva na aba Pagina.']),
    'qual arquivo de fundo usar: ele sai do seu computador, não da conversa.',
  ];

  return {
    tipo: 'proposta',
    nome: texto(bruto?.nome),
    // 🚨 O RESUMO NÃO PODE PROMETER O QUE A TRAVA BARROU.
    //
    // Medido em 28/08: o agente resumiu "a blacklist será desativada" enquanto a
    // trava, logo abaixo na mesma tela, dizia o contrário. Duas frases opostas
    // no mesmo lugar, e a primeira é a que se lê primeiro. Não dá pra reescrever
    // a frase dele com confiança, mas dá pra recusar que ela passe sozinha.
    entendi: publico.travas.length
      ? `${texto(bruto?.entendi)} (menos o que está em "Isso eu não faço", logo abaixo)`
      : texto(bruto?.entendi),
    publico: {
      regras: publico.regras,
      decisoes: publico.decisoes,
      total: resultado.total,
      funil: resultado.funil,
    },
    producao: { valores: producao.valores, decisoes: producao.decisoes },
    template,
    pagina: paginaProposta,
    travas: publico.travas,
    avisos: publico.avisos,
    ignorei: [...publico.ignorei, ...producao.ignorei, ...template.ignorei],
    naoDecidi,
    catalogo: { considerados: consideramos, aprovados: noCatalogo },
  };
};

export default {
  proporCampanha,
  normalizarPublico,
  normalizarProducao,
  normalizarVariaveis,
  encurtarCatalogo,
  VOCABULARIO,
  TRAVAS,
};
