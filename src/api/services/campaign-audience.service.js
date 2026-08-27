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
    p.id                                      AS pet_id,
    p.name                                    AS pet_name,
    p.created_at                              AS pet_created_at,
    p.is_active                               AS pet_is_active,
    p.deceased_on                             AS deceased_on,
    p.original_photo                          AS original_photo,
    p.photo                                   AS photo,
    pt.name                                   AS especie,
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
  LEFT JOIN pet_genders g ON g.id = p.pet_gender_id
  JOIN pet_owners o  ON o.id = pop.pet_owner_id
  WHERE o.cell_phone IS NOT NULL
  ORDER BY o.cell_phone, p.created_at
`;

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
  vinculo: ['principal', 'cotutor', 'qualquer'].includes(raw.vinculo) ? raw.vinculo : 'qualquer',
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

  const funil = [];
  const degrauPet = (id, titulo, ligada, detalhe, antes, depois) =>
    funil.push({
      id,
      titulo,
      detalhe,
      unidade: 'pets',
      ligada,
      antes,
      saem: ligada ? antes - depois : 0,
      entram: depois,
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

  // ── VÍNCULO ───────────────────────────────────────────────────────────────
  // pet_owner_pets é N:N e `is_main_owner` diz quem é o tutor principal. O mesmo
  // pet gera peça pros dois tutores quando o vínculo é 'qualquer' — às vezes é o
  // desejado (casal) e às vezes não, então a escolha é do operador, não minha.
  if (regras.vinculo !== 'qualquer') {
    const querPrincipal = regras.vinculo === 'principal';
    const depois = atual.filter((l) => !!l.is_main_owner === querPrincipal);
    degrauPet(
      'vinculo',
      querPrincipal ? 'Só tutor principal' : 'Só co-tutor',
      true,
      'pet_owner_pets.is_main_owner. O vínculo é N:N.',
      antes,
      contarPets(depois),
    );
    atual = depois;
    antes = contarPets(atual);
  } else {
    degrauPet(
      'vinculo',
      'Vínculo: qualquer',
      false,
      'pet_owner_pets é N:N. O mesmo pet pode gerar peça pra dois tutores.',
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
      originalPhoto: l.original_photo,
      photo: l.photo,
      criadoEm: l.pet_created_at,
    });
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
        foto: p.originalPhoto,
      })),
      fundidos: t.fundidos,
    })),
  };
};

export default { montarPublico, normalizarRegras };
