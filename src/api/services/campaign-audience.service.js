/* ============================================================================
 * PÚBLICO DE CAMPANHA — o funil de elegibilidade, em regras nomeadas
 * ============================================================================
 *
 * Este arquivo é a versão permanente do que os scripts `marketing/tmp-*-dogday.mjs`
 * fizeram à mão em 26/08/2026, quando 67 tutores receberam a peça do Dia do
 * Cachorro. Cada regra abaixo carrega, no comentário, o motivo de existir e o
 * campo errado que ela NÃO usa — porque em todos os quatro casos o nome óbvio é
 * o campo errado, e o guard que usa o nome óbvio nunca filtra nada.
 *
 * O funil daquele dia, pra servir de régua:
 *   121 cachorros vivos e ativos → 71 tutores com foto própria → 70 (menos um
 *   veterinário, exclusão manual) → 67 (menos a blacklist).
 *
 * 🚨 Por que as regras são aplicadas em JS e não em SQL: o universo é pequeno
 * (~150 pets) e o funil precisa dizer quantos CADA regra cortou. Em SQL isso
 * viraria uma CTE por degrau e a semântica ficaria espalhada; aqui a regra e a
 * contagem dela ficam na mesma linha, legíveis por quem for auditar um disparo.
 * A duplicata de cadastro, aliás, não tem como ser SQL: ela compara nomes.
 * ============================================================================ */

import { sequelize } from '../../config/database.js';
import { QueryTypes } from 'sequelize';
import { fraseDoCampo } from './campaign-fala.service.js';

/**
 * O universo: toda linha de pet_owner_pets com o pet, o dono e a supressão já
 * resolvida. Nenhum filtro de elegibilidade acontece aqui — todos são regras,
 * e regra é coisa que o operador liga e desliga vendo o número mudar.
 *
 * 🚨 pet_owner_pets é N:N (145 linhas pra 121 pets distintos em 26/08). Contar
 * linha em vez de pet distinto infla o número em 20%. Quem conta é o funil, com
 * Set de pet_id, nunca `rows.length`.
 */
const SQL_UNIVERSO = `
  SELECT
    pop.pet_owner_id                          AS owner_id,
    pop.is_main_owner                         AS is_main_owner,
    pop.is_active                             AS vinculo_is_active,
    pop.removed_at                            AS vinculo_removed_at,
    ot.name                                   AS vinculo_tipo,
    ot.label                                  AS vinculo_rotulo,
    p.id                                      AS pet_id,
    p.name                                    AS pet_name,
    p.created_at                              AS pet_created_at,
    p.is_active                               AS pet_is_active,
    p.deceased_on                             AS deceased_on,
    p.original_photo                          AS original_photo,
    p.photo                                   AS photo,
    pt.name                                   AS especie,
    pt.label                                  AS especie_rotulo,
    br.label                                  AS raca_rotulo,
    br.name                                   AS raca_nome,
    g.name                                    AS genero,
    o.name                                    AS owner_name,
    o.cell_phone                              AS cell_phone,
    EXISTS (
      SELECT 1 FROM nudge_suppressions ns
      WHERE ns.phone = o.cell_phone
        AND ns.topic = 'all'
        AND ns.revoked_at IS NULL
        AND (ns.until IS NULL OR ns.until > NOW())
    )                                         AS suprimido
  FROM pet_owner_pets pop
  JOIN pets p        ON p.id = pop.pet_id
  JOIN pet_types pt  ON pt.id = p.pet_type_id
  LEFT JOIN pet_owner_types ot ON ot.id = pop.pet_owner_type_id
  LEFT JOIN pet_breeds br ON br.id = p.pet_breed_id
  LEFT JOIN pet_genders g ON g.id = p.pet_gender_id
  JOIN pet_owners o  ON o.id = pop.pet_owner_id
  WHERE o.cell_phone IS NOT NULL
  ORDER BY o.cell_phone, p.created_at
`;

/**
 * 🚨 A RAÇA MORA EM `pet_breeds`, e o rótulo legível é `label`, não `name`.
 *
 * Medido 31/08/2026 contra prod: `name` é o nome em inglês do catálogo
 * ("Maltese", "French Bulldog", "Pomeranian") e `label` é o que a pessoa
 * reconhece ("Maltês", "Bulldog Francês", "Lulu da Pomerânia"). Mostrar `name`
 * numa tela em português funciona pra Pug e Border Collie e falha justo nas
 * raças que têm nome traduzido, que é onde o operador olharia pra conferir.
 *
 * Preenchimento medido no mesmo dia: 155 de 155 pets ativos têm `pet_breed_id`.
 * O fallback existe pro pet que entrar sem ela amanhã, não pra hoje.
 */
const racaLegivel = (l) => l.raca_rotulo || l.raca_nome || null;

/**
 * 🚨 OS TIPOS DE VÍNCULO SÃO DADO, e a lista sai do banco.
 *
 * `pet_owner_pets.pet_owner_type_id` aponta pra `pet_owner_types`, que em
 * 31/08/2026 tem sete linhas: principal (153 vínculos), co-tutor (24),
 * veterinário (3), rede de apoio (1), e passeador, cuidador e contato de
 * emergência com zero. A regra de público oferecia TRÊS opções, deduzidas do
 * booleano `is_main_owner`, e ignorava a coluna inteira.
 *
 * 🚨 A consequência já aconteceu: no Dia do Cachorro um veterinário saiu do
 * público por EXCLUSÃO MANUAL, com o motivo escrito à mão, sob a justificativa
 * de que "nada no schema separa veterinário de tutor". Separa desde sempre.
 * Aquela linha à mão nunca precisou existir, e lista à mão é a coisa que
 * envelhece e vira álibi.
 *
 * Escrever os sete aqui repetiria o mesmo erro noutra camada: o oitavo tipo
 * cadastrado amanhã sumiria da tela sem nada acusar. A lista vem da tabela.
 */
export const tiposDeVinculo = async () => {
  const linhas = await sequelize.query(
    `SELECT t.name, t.label, COUNT(pop.id) AS vinculos
       FROM pet_owner_types t
       LEFT JOIN pet_owner_pets pop ON pop.pet_owner_type_id = t.id
      WHERE t.is_active IS NOT FALSE
      GROUP BY t.id, t.name, t.label, t.display_order
      ORDER BY t.display_order, t.name`,
    { type: QueryTypes.SELECT },
  );
  return linhas.map((l) => ({
    nome: l.name,
    rotulo: l.label || l.name,
    vinculos: Number(l.vinculos || 0),
  }));
};

/**
 * Os grupos de vínculo, que são o recorte que uma campanha de fato pede.
 *
 * `dono` é o que faltava e é o que resolve o caso do veterinário: quem recebe
 * "uma homenagem pro seu cachorro" precisa ser dono do cachorro. Os outros
 * cinco tipos são gente que tem acesso ao pet, não gente de quem o pet é.
 */
export const GRUPOS_DE_VINCULO = {
  qualquer: null,
  dono: ['primary', 'co_parent'],
  principal: ['primary'],
  cotutor: ['co_parent'],
};

const normalizarTelefone = (raw) => String(raw || '').replace(/\D/g, '');

/** Regras que chegam do cockpit, com os defaults do Dia do Cachorro. */
export const normalizarRegras = (raw = {}) => ({
  especie: typeof raw.especie === 'string' ? raw.especie : 'Dog',
  petVivo: raw.petVivo !== false,
  petAtivo: raw.petAtivo !== false,
  fotoPropria: raw.fotoPropria !== false,
  // 'todos' = o tutor só entra se TODOS os pets dele têm foto própria (foi o que
  // rodou em 26/08). 'algum' = basta um. Ver o degrau da foto lá embaixo.
  fotoEscopo: raw.fotoEscopo === 'algum' ? 'algum' : 'todos',
  // 🚨 O PADRÃO PASSOU A SER `dono` (31/08). Antes era `qualquer`, e `qualquer`
  // manda "uma homenagem pro seu cachorro" pro veterinário que tem acesso à
  // ficha do cachorro de outra pessoa. Foi exatamente o que obrigou a exclusão
  // manual do Dia do Cachorro. O padrão seguro é o recorte de quem é dono; quem
  // quiser alcançar a rede inteira pede `qualquer` e vê o número subir.
  //
  // O valor pode ser um GRUPO ou o nome de um tipo de vínculo do banco. Não há
  // lista fechada aqui de propósito: ver `tiposDeVinculo`. Um nome que não
  // existe não é silenciado, ele vira um degrau que corta tudo e aparece no
  // funil como corte, que é o sintoma barulhento em vez do mudo.
  vinculo: typeof raw.vinculo === 'string' && /^[a-z_]+$/.test(raw.vinculo) ? raw.vinculo : 'dono',
  dedupNome: raw.dedupNome !== false,
  personasTeste: raw.personasTeste !== false,
  blacklist: raw.blacklist !== false,
  exclusoes: Array.isArray(raw.exclusoes)
    ? raw.exclusoes
        .map((e) => ({ telefone: normalizarTelefone(e?.telefone), motivo: String(e?.motivo || '').trim() }))
        .filter((e) => e.telefone)
    : [],
});

const contarPets = (linhas) => new Set(linhas.map((l) => l.pet_id)).size;

export const montarPublico = async (regrasBrutas) => {
  const regras = normalizarRegras(regrasBrutas);
  const linhas = await sequelize.query(SQL_UNIVERSO, { type: QueryTypes.SELECT });
  // 🚨 Os tipos voltam JUNTO com o funil pra tela montar o seletor de vínculo a
  // partir do banco. Uma lista escrita no frontend é a mesma que envelhece e
  // vira álibi: o oitavo tipo cadastrado amanhã ficaria invisível pro operador
  // sem nada acusar, exatamente como os quatro que já eram invisíveis.
  let tipos = [];
  try {
    tipos = await tiposDeVinculo();
  } catch {
    tipos = [];
  }

  const funil = [];
  const degrauPet = (id, titulo, ligada, detalhe, antes, depois, nota) =>
    funil.push({
      id,
      titulo,
      detalhe,
      unidade: 'pets',
      ligada,
      antes,
      saem: ligada ? antes - depois : 0,
      entram: depois,
      ...(nota ? { nota } : {}),
    });

  let atual = linhas;
  let antes = contarPets(atual);

  funil.push({
    id: 'universo',
    titulo: 'Pets cadastrados',
    detalhe: 'Todo pet ligado a um tutor com telefone.',
    unidade: 'pets',
    ligada: true,
    antes: null,
    saem: 0,
    entram: antes,
  });

  // ── ESPÉCIE ───────────────────────────────────────────────────────────────
  // 🚨 Não existe coluna `species` na tabela pets. A espécie sai do join em
  // pet_types (`pt.name`), e os valores são 'Dog', 'Cat', etc.
  if (regras.especie && regras.especie !== 'todas') {
    const depois = atual.filter((l) => l.especie === regras.especie);
    degrauPet(
      'especie',
      `Espécie: ${regras.especie}`,
      true,
      'Join em pet_types. A tabela pets não tem coluna de espécie.',
      antes,
      contarPets(depois),
    );
    atual = depois;
    antes = contarPets(atual);
  } else {
    degrauPet('especie', 'Espécie: todas', false, 'Join em pet_types.', antes, antes);
  }

  // ── PET VIVO ──────────────────────────────────────────────────────────────
  // 🚨🚨 O campo é `deceased_on`, NUNCA `death_date`.
  //
  // `death_date` existe no schema e tem ZERO linhas preenchidas nos 158 pets
  // (medido 26/08/2026). Filtrar por ela é um guard que nunca filtra nada e
  // ainda passa a impressão de que o caso está coberto.
  //
  // `is_active` NÃO cobre: a Zoé tem deceased_on preenchido E is_active = true.
  // Sem esta regra a tutora receberia uma homenagem de Dia do Cachorro citando
  // a cadela que morreu. Não existe pedido de desculpas que conserte isso.
  //
  // `memorial_photo` NÃO serve como critério: há pets vivos com memorial_photo.
  if (regras.petVivo) {
    const depois = atual.filter((l) => l.deceased_on === null);
    degrauPet(
      'petVivo',
      'Pet vivo',
      true,
      'deceased_on está vazio. Não é death_date (0 linhas) nem is_active (não cobre).',
      antes,
      contarPets(depois),
    );
    atual = depois;
    antes = contarPets(atual);
  } else {
    degrauPet('petVivo', 'Pet vivo', false, 'deceased_on está vazio.', antes, antes);
  }

  // ── PET ATIVO ─────────────────────────────────────────────────────────────
  if (regras.petAtivo) {
    const depois = atual.filter((l) => l.pet_is_active !== false);
    degrauPet('petAtivo', 'Pet ativo', true, 'is_active não é falso.', antes, contarPets(depois));
    atual = depois;
    antes = contarPets(atual);
  } else {
    degrauPet('petAtivo', 'Pet ativo', false, 'is_active não é falso.', antes, antes);
  }

  // ── VÍNCULO VIVO ──────────────────────────────────────────────────────────
  // 🚨🚨 ISTO NÃO É REGRA, É CONSERTO. Até 31/08 o universo juntava
  // `pet_owner_pets` sem olhar se o vínculo ainda existe, e o funil contava
  // gente que já tinha saído de perto do pet. Medido em prod naquele dia: 1 dos
  // 69 tutores do funil de cachorro entrava SÓ por vínculo removido, com o pet
  // de outra casa no nome dele.
  //
  // 🚨 E as DUAS condições são necessárias. O `messaging.service` filtra só
  // `pop.is_active = true`, e isso NÃO basta: em prod há uma linha com
  // `is_active = true` E `removed_at` preenchido, e é justamente ela que fazia
  // aquela tutora entrar. Copiar o filtro de lá teria consertado 2 dos 3
  // vínculos mortos dela e deixado o terceiro passar, com o número parecendo
  // certo.
  //
  // Por que é degrau e não filtro escondido no SQL: filtrar calado tiraria a
  // pessoa da conta sem nada dizer, e "sumiu um tutor entre ontem e hoje" é
  // exatamente a pergunta que o funil existe pra responder. Ele não tem
  // interruptor porque não há campanha pra qual mandar mensagem sobre o pet de
  // quem já saiu seja o certo.
  {
    const depois = atual.filter((l) => l.vinculo_is_active !== false && !l.vinculo_removed_at);
    // 🚨 A NOTA É OBRIGATÓRIA AQUI, e a razão é a mesma da duplicata de
    // cadastro: este degrau corta VÍNCULO, e o funil conta PET. Um pet que
    // pertence a duas casas não some quando um dos vínculos morre, então a
    // contagem de pets fica igual e o degrau aparece com "saem 0" — a cara
    // exata do guard que nunca filtra nada. Quem some é o tutor, dois degraus
    // abaixo, e sem esta linha ninguém liga uma coisa à outra.
    const mortos = atual.length - depois.length;
    degrauPet(
      'vinculoAtivo',
      'Quem saiu de perto do pet fica de fora',
      true,
      'O vínculo com o pet segue de pé: ninguém desativou nem removeu.',
      antes,
      contarPets(depois),
      mortos
        ? `${mortos} ${mortos === 1 ? 'vínculo removido saiu' : 'vínculos removidos saíram'}`
        : null,
    );
    atual = depois;
    antes = contarPets(atual);
  }

  // ── VÍNCULO ───────────────────────────────────────────────────────────────
  // 🚨 O tipo do vínculo sai de `pet_owner_types`, não do booleano
  // `is_main_owner`. Os dois concordam hoje (153 principais em ambos, medido
  // 31/08), mas o booleano só sabe dizer "é o principal ou não é", e o "não é"
  // junta co-tutor com veterinário, passeador, cuidador, rede de apoio e
  // contato de emergência. Era essa mistura que obrigava a exclusão à mão.
  // 🚨 `in`, não `??`. O grupo `qualquer` vale `null` de propósito (quer dizer
  // "não filtra"), e `null ?? [x]` devolve `[x]`: o degrau passava a procurar um
  // tipo de vínculo chamado "qualquer", que não existe, e zerava o público
  // inteiro. Chave que existe valendo null é justamente o caso que o `??` não
  // distingue de chave ausente.
  const tiposPedidos =
    regras.vinculo in GRUPOS_DE_VINCULO ? GRUPOS_DE_VINCULO[regras.vinculo] : [regras.vinculo];
  if (tiposPedidos) {
    const rotulos = [
      ...new Set(atual.filter((l) => tiposPedidos.includes(l.vinculo_tipo)).map((l) => l.vinculo_rotulo)),
    ].filter(Boolean);
    const depois = atual.filter((l) => tiposPedidos.includes(l.vinculo_tipo));
    degrauPet(
      'vinculo',
      fraseDoCampo('vinculo', regras.vinculo, {
        rotulosDeVinculo: Object.fromEntries(
          linhas.filter((l) => l.vinculo_tipo).map((l) => [l.vinculo_tipo, l.vinculo_rotulo]),
        ),
      }) || `Só o vínculo "${regras.vinculo}"`,
      true,
      rotulos.length
        ? `Vale pra quem entra como ${rotulos.map((r) => r.toLowerCase()).join(' ou ')}.`
        : 'Nenhum vínculo desse tipo existe na base hoje.',
      antes,
      contarPets(depois),
    );
    atual = depois;
    antes = contarPets(atual);
  } else {
    degrauPet(
      'vinculo',
      'Qualquer pessoa ligada ao pet, dono ou não',
      false,
      'O mesmo pet pode gerar peça pra duas pessoas. Veterinário e passeador entram junto.',
      antes,
      antes,
    );
  }

  // ── AGRUPAMENTO POR TUTOR ─────────────────────────────────────────────────
  // Daqui pra baixo a unidade do funil deixa de ser pet e passa a ser tutor,
  // porque é o tutor que recebe a mensagem. O funil diz a unidade de cada degrau
  // justamente pra ninguém comparar 121 com 67 como se fossem a mesma coisa.
  const porTutor = new Map();
  for (const l of atual) {
    const telefone = normalizarTelefone(l.cell_phone);
    if (telefone.length < 12) continue;
    if (!porTutor.has(telefone)) {
      porTutor.set(telefone, {
        telefone,
        nome: l.owner_name,
        ownerId: l.owner_id,
        suprimido: !!l.suprimido,
        pets: [],
        fundidos: [],
        vinculos: new Map(),
      });
    }
    const tutor = porTutor.get(telefone);
    // Pet compartilhado pode voltar duplicado pro mesmo tutor (duas linhas de
    // vínculo). Isso não é duplicata de cadastro, é só o N:N.
    if (tutor.pets.some((p) => p.id === l.pet_id)) continue;
    tutor.pets.push({
      id: l.pet_id,
      nome: l.pet_name,
      genero: l.genero,
      // 🚨 Espécie e raça entram aqui pra aparecerem na lista de "quem entra".
      // A lista é a única prova que o olho confere, e telefone + nome + nome do
      // pet não dizem se o público faz sentido: "Ricota" pode ser o gato que não
      // devia estar num disparo de cachorro, e nada na linha acusa.
      especie: l.especie_rotulo || l.especie,
      raca: racaLegivel(l),
      originalPhoto: l.original_photo,
      photo: l.photo,
      criadoEm: l.pet_created_at,
    });
    // O tipo de vínculo é do par tutor+pet, não do tutor. Guardado por pet, o
    // "Veterinário" aparece na linha exata que o justifica.
    tutor.vinculos.set(l.pet_id, l.vinculo_rotulo || l.vinculo_tipo || null);
  }

  let tutores = [...porTutor.values()];
  funil.push({
    id: 'agrupamento',
    titulo: 'Tutores alcançados',
    detalhe: 'Um pet com dois tutores conta pros dois. Telefone com menos de 12 dígitos sai.',
    unidade: 'tutores',
    ligada: true,
    antes: null,
    saem: 0,
    entram: tutores.length,
  });

  const degrauTutor = (id, titulo, ligada, detalhe, lista, nota) => {
    const anteriores = tutores.length;
    const depois = ligada ? lista : tutores;
    funil.push({
      id,
      titulo,
      detalhe,
      unidade: 'tutores',
      ligada,
      antes: anteriores,
      saem: anteriores - depois.length,
      entram: depois.length,
      ...(nota ? { nota } : {}),
    });
    tutores = depois;
  };

  // ── FOTO PRÓPRIA ──────────────────────────────────────────────────────────
  // 🚨 O campo é `original_photo`, NUNCA `photo`.
  //
  // `photo` inclui os breed-portraits — a ilustração genérica da raça — e 37 dos
  // 121 cachorros ativos caem nisso. Numa peça que promete "olha o seu cachorro",
  // isso é a foto de outro cachorro.
  //
  // O escopo é a parte que muda o tamanho do público: 'todos' exige que TODOS os
  // pets do tutor tenham foto própria (foi o que rodou em 26/08, e é o certo
  // quando a peça mostra a casa inteira); 'algum' basta um, e aí a peça precisa
  // saber ignorar os pets sem foto.
  degrauTutor(
    'fotoPropria',
    regras.fotoEscopo === 'algum' ? 'Foto própria (ao menos um pet)' : 'Foto própria (todos os pets)',
    regras.fotoPropria,
    'original_photo preenchido. Não é `photo`, que inclui ilustração genérica de raça.',
    tutores.filter((t) =>
      regras.fotoEscopo === 'algum'
        ? t.pets.some((p) => p.originalPhoto)
        : t.pets.every((p) => p.originalPhoto),
    ),
  );

  // ── DUPLICATA DE CADASTRO ─────────────────────────────────────────────────
  // 🚨 O MESMO cachorro cadastrado duas vezes pelo mesmo tutor, com fotos
  // diferentes. Dois casos em 67 tutores no Dia do Cachorro, os dois apontados
  // pelo olho e nenhum pelo schema: a peça saía com o cachorro clonado lado a
  // lado e a frase dizia "pro Raul e pro Raul".
  //
  // Fica o `created_at` mais antigo, que é o cadastro original. Esta regra não
  // corta tutor nenhum — ela funde pets — então o degrau sai com `saem: 0` e a
  // conta dos fundidos na nota. Dizer que ela cortou zero seria esconder o que
  // ela fez.
  if (regras.dedupNome) {
    let fundidos = 0;
    for (const tutor of tutores) {
      const vistos = new Map();
      const ordenados = [...tutor.pets].sort(
        (a, b) => new Date(a.criadoEm) - new Date(b.criadoEm),
      );
      for (const pet of ordenados) {
        const chave = String(pet.nome || '').trim().toLowerCase();
        if (chave && vistos.has(chave)) {
          tutor.fundidos.push({ nome: pet.nome, mantido: vistos.get(chave).nome });
          fundidos += 1;
          continue;
        }
        if (chave) vistos.set(chave, pet);
      }
      tutor.pets = [...vistos.values()];
    }
    degrauTutor(
      'dedupNome',
      'Duplicata de cadastro',
      true,
      'Mesmo nome no mesmo tutor vira um pet só. Fica o cadastro mais antigo.',
      tutores,
      `${fundidos} ${fundidos === 1 ? 'pet fundido' : 'pets fundidos'}`,
    );
  } else {
    degrauTutor(
      'dedupNome',
      'Duplicata de cadastro',
      false,
      'Mesmo nome no mesmo tutor vira um pet só.',
      tutores,
    );
  }

  // ── PERSONAS DE TESTE ─────────────────────────────────────────────────────
  // O range 55000000000xx (DDI 55 + DDD 00 inválido) é populado pelos e2e e tem
  // pet com foto como qualquer tutor, então passa em TODO critério de
  // elegibilidade. Não dá erro: a Meta só não entrega, e o número da campanha
  // fica inflado por um destinatário que não existe.
  degrauTutor(
    'personasTeste',
    'Fora as personas de teste',
    regras.personasTeste,
    'cell_phone não começa com 55000000000.',
    tutores.filter((t) => !t.telefone.startsWith('55000000000')),
  );

  // ── EXCLUSÃO MANUAL ───────────────────────────────────────────────────────
  // Lista à mão envelhece e vira álibi, então ela só aceita o que NENHUM
  // critério do banco distingue — o caso do Dia do Cachorro foi um veterinário,
  // e nada no schema separa veterinário de tutor. Se dá pra descobrir por
  // consulta, o lugar é uma regra, não esta lista. Por isso o motivo é
  // obrigatório: é ele que deixa a exclusão auditável seis meses depois.
  const excluidos = new Map(regras.exclusoes.map((e) => [e.telefone, e.motivo]));
  degrauTutor(
    'exclusoes',
    'Exclusão manual',
    excluidos.size > 0,
    'Só pro que nenhum critério do banco distingue. Cada linha com o motivo escrito.',
    tutores.filter((t) => !excluidos.has(t.telefone)),
  );

  // ── BLACKLIST ─────────────────────────────────────────────────────────────
  // 🚨🚨 Quem pediu pra não ser incomodado. Supressão ATIVA de tópico 'all'.
  //
  // ATIVA quer dizer as DUAS coisas: `revoked_at` nulo (ninguém revogou) E
  // `until` nulo ou no futuro (não expirou). Checar só o revoked_at deixaria
  // passar supressão vencida; checar só o until deixaria passar supressão
  // revogada.
  //
  // Ignorar isso numa campanha de MARKETING não solicitada é o pior tipo de
  // erro, porque desfaz uma decisão que já tinha sido tomada A FAVOR do tutor.
  //
  // Tópico ESPECÍFICO (daily_checkin, first_contact) NÃO corta: quem calou o
  // lembrete diário não disse nada sobre uma homenagem de Dia do Cachorro.
  degrauTutor(
    'blacklist',
    'Não perturbe',
    regras.blacklist,
    "nudge_suppressions topic='all' com revoked_at vazio E (until vazio ou no futuro).",
    tutores.filter((t) => !t.suprimido),
  );

  return {
    regras,
    funil,
    vinculosDisponiveis: tipos,
    total: tutores.length,
    totalPets: tutores.reduce((n, t) => n + t.pets.length, 0),
    tutores: tutores.map((t) => ({
      telefone: t.telefone,
      nome: t.nome,
      ownerId: t.ownerId,
      pets: t.pets.map((p) => ({
        id: p.id,
        nome: p.nome,
        genero: p.genero,
        especie: p.especie,
        raca: p.raca,
        vinculo: t.vinculos.get(p.id) ?? null,
        foto: p.originalPhoto,
      })),
      fundidos: t.fundidos,
    })),
  };
};

export default { montarPublico, normalizarRegras, tiposDeVinculo, GRUPOS_DE_VINCULO };
