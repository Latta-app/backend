// O FUNIL DE PÚBLICO: quem entra num disparo, degrau a degrau.
//
// ── O ALCANCE ──────────────────────────────────────────────────────────────
// PEGA:
//   · 🚨 VÍNCULO MORTO entrando no público. Até 31/08 o universo juntava
//     pet_owner_pets sem olhar se o vínculo ainda existe, e o funil contava
//     gente que já tinha saído de perto do pet;
//   · 🚨 o filtro do vínculo morto sendo SÓ `is_active`. É o que o
//     messaging.service faz, e não basta: prod tem linha com is_active = true e
//     removed_at preenchido, e era ela que passava;
//   · 🚨 o vínculo sendo lido do booleano `is_main_owner` em vez do tipo. O
//     booleano junta co-tutor com veterinário, passeador e cuidador no mesmo
//     "não é o principal", e foi essa mistura que obrigou a exclusão à mão do
//     Dia do Cachorro;
//   · espécie e raça sumindo da lista de quem entra: sem elas o olho não tem
//     como conferir se o público faz sentido.
// NÃO PEGA:
//   · os quatro campos de elegibilidade de pet (deceased_on, original_photo,
//     dedup por nome, personas). Aqueles já têm degrau e comentário no serviço,
//     e o que muda aqui é o vínculo.
import { describe, it, expect, vi, beforeEach } from 'vitest';

const query = vi.fn();
vi.mock('../../config/database.js', () => ({ sequelize: { query: (...a) => query(...a) } }));
vi.mock('../../config/postgres.js', () => ({ pgQuery: vi.fn(async () => ({ rows: [] })) }));

const { montarPublico, normalizarRegras, GRUPOS_DE_VINCULO } = await import(
  '../services/campaign-audience.service.js'
);

/**
 * Uma linha do universo, com os padrões saudáveis. Cada teste muda só o que
 * está provando, que é o que faz a falha apontar pro degrau certo.
 */
const linha = (over = {}) => ({
  owner_id: 'o1',
  is_main_owner: true,
  vinculo_is_active: true,
  vinculo_removed_at: null,
  vinculo_tipo: 'primary',
  vinculo_rotulo: 'Principal Responsável',
  pet_id: 'p1',
  pet_name: 'Bilbo',
  pet_created_at: '2026-01-01',
  pet_is_active: true,
  deceased_on: null,
  original_photo: 'https://s3/foto.jpg',
  photo: 'https://s3/foto.jpg',
  especie: 'Dog',
  especie_rotulo: 'Cachorro',
  raca_rotulo: 'Maltês',
  raca_nome: 'Maltese',
  genero: 'Male',
  owner_name: 'Lucas',
  cell_phone: '5531991927909',
  suprimido: false,
  ...over,
});

const degrau = (r, id) => r.funil.find((d) => d.id === id);

beforeEach(() => query.mockReset());

describe('🚨 vínculo morto não entra no público', () => {
  it('vínculo desativado sai, e o funil DIZ que saiu', () => {
    // Filtrar calado tiraria a pessoa da conta sem nada dizer, e "sumiu um
    // tutor entre ontem e hoje" é exatamente o que o funil existe pra responder.
    query.mockResolvedValueOnce([
      linha(),
      linha({
        owner_id: 'o2',
        pet_id: 'p2',
        cell_phone: '5531988884887',
        owner_name: 'Clara',
        vinculo_is_active: false,
        vinculo_removed_at: '2026-08-30',
      }),
    ]);
    return montarPublico({ vinculo: 'qualquer' }).then((r) => {
      expect(r.total).toBe(1);
      expect(degrau(r, 'vinculoAtivo').saem).toBe(1);
      expect(degrau(r, 'vinculoAtivo').ligada).toBe(true);
    });
  });

  it('🚨 is_active = true com removed_at preenchido TAMBÉM sai', () => {
    // Este é o caso que o filtro do messaging.service (`pop.is_active = true`,
    // sozinho) deixa passar. Prod tem exatamente uma linha assim em 31/08, e é
    // ela que fazia a tutora entrar no funil do Dia do Cachorro. Copiar aquele
    // filtro teria consertado dois dos três vínculos dela e deixado o terceiro,
    // com o número parecendo certo.
    query.mockResolvedValueOnce([
      linha(),
      linha({
        owner_id: 'o2',
        pet_id: 'p2',
        cell_phone: '5531988884887',
        owner_name: 'Clara',
        vinculo_is_active: true,
        vinculo_removed_at: '2026-07-30',
      }),
    ]);
    return montarPublico({ vinculo: 'qualquer' }).then((r) => {
      expect(r.total).toBe(1);
      expect(degrau(r, 'vinculoAtivo').saem).toBe(1);
    });
  });

  it('🚨 o degrau conta o VÍNCULO cortado, porque o pet nem sempre some', async () => {
    // Pet de duas casas não some quando um dos vínculos morre: a contagem de
    // pets fica igual e o degrau aparece com "saem 0", a cara exata do guard
    // que nunca filtra nada. Quem some é o tutor, dois degraus abaixo.
    query.mockResolvedValueOnce([
      linha(),
      linha({
        owner_id: 'o2',
        cell_phone: '5531988884887',
        owner_name: 'Clara',
        is_main_owner: false,
        vinculo_tipo: 'co_parent',
        vinculo_rotulo: 'Co-tutor',
        vinculo_is_active: true,
        vinculo_removed_at: '2026-07-30',
      }),
    ]);
    const r = await montarPublico({ vinculo: 'qualquer' });
    expect(degrau(r, 'vinculoAtivo').saem).toBe(0); // o pet continua, é o mesmo
    expect(degrau(r, 'vinculoAtivo').nota).toMatch(/1 vínculo removido/);
    expect(r.total).toBe(1); // mas a tutora sumiu
  });

  it('o degrau do vínculo vivo não tem interruptor', async () => {
    // Não há campanha pra qual mandar mensagem sobre o pet de quem já saiu seja
    // o certo, então isto não é regra: é conserto, e fica sempre ligado.
    query.mockResolvedValueOnce([linha()]);
    const r = await montarPublico({ vinculoAtivo: false, vinculo: 'qualquer' });
    expect(degrau(r, 'vinculoAtivo').ligada).toBe(true);
    expect(r.regras.vinculoAtivo).toBeUndefined();
  });
});

describe('🚨 o vínculo sai do TIPO, não do booleano', () => {
  it('o padrão é "dono", e ele deixa o veterinário de fora', async () => {
    // O Dia do Cachorro tirou um veterinário do público com EXCLUSÃO MANUAL,
    // sob a justificativa de que nada no schema separava veterinário de tutor.
    // Separa. A regra o pega sozinha, e a lista à mão nunca precisou existir.
    query.mockResolvedValueOnce([
      linha(),
      linha({
        owner_id: 'vet',
        pet_id: 'p9',
        cell_phone: '5531999300962',
        owner_name: 'Lucas Viola',
        pet_name: 'Ricota',
        is_main_owner: false,
        vinculo_tipo: 'veterinarian',
        vinculo_rotulo: 'Veterinário',
      }),
    ]);
    const r = await montarPublico({});
    expect(r.regras.vinculo).toBe('dono');
    expect(r.total).toBe(1);
    expect(r.tutores[0].nome).toBe('Lucas');
    expect(degrau(r, 'vinculo').saem).toBe(1);
  });

  it('🚨 "dono" NÃO é o mesmo que is_main_owner: o co-tutor entra', async () => {
    // O booleano só sabe dizer "é o principal ou não é", e o "não é" junta
    // co-tutor com veterinário, passeador, cuidador, rede de apoio e contato de
    // emergência. Dono é o par principal + co-tutor.
    query.mockResolvedValueOnce([
      linha({ is_main_owner: false, vinculo_tipo: 'co_parent', vinculo_rotulo: 'Co-tutor' }),
    ]);
    const r = await montarPublico({ vinculo: 'dono' });
    expect(r.total).toBe(1);
    expect(GRUPOS_DE_VINCULO.dono).toEqual(['primary', 'co_parent']);
  });

  it('dá pra recortar por um tipo específico do banco', async () => {
    query.mockResolvedValueOnce([
      linha(),
      linha({
        owner_id: 'vet',
        pet_id: 'p9',
        cell_phone: '5531999300962',
        owner_name: 'Lucas Viola',
        is_main_owner: false,
        vinculo_tipo: 'veterinarian',
        vinculo_rotulo: 'Veterinário',
      }),
    ]);
    const r = await montarPublico({ vinculo: 'veterinarian' });
    expect(r.total).toBe(1);
    expect(r.tutores[0].nome).toBe('Lucas Viola');
    expect(degrau(r, 'vinculo').titulo).toBe('Só quem entra como veterinário');
  });

  it('"qualquer" continua existindo, e o degrau AVISA quem entra junto', async () => {
    query.mockResolvedValueOnce([
      linha(),
      linha({
        owner_id: 'vet',
        pet_id: 'p9',
        cell_phone: '5531999300962',
        is_main_owner: false,
        vinculo_tipo: 'veterinarian',
        vinculo_rotulo: 'Veterinário',
      }),
    ]);
    const r = await montarPublico({ vinculo: 'qualquer' });
    expect(r.total).toBe(2);
    expect(degrau(r, 'vinculo').ligada).toBe(false);
    expect(degrau(r, 'vinculo').detalhe).toMatch(/veterinário/i);
  });

  it('🚨 nenhum degrau do funil mostra nome de campo no TÍTULO', () => {
    // O título é o que o operador lê correndo o olho. O detalhe pode ser
    // técnico de propósito; o título, não.
    query.mockResolvedValueOnce([linha()]);
    return montarPublico({}).then((r) => {
      for (const d of r.funil) {
        expect(d.titulo, `"${d.titulo}" tem cara de campo`).not.toMatch(
          /_|deceased|original_photo|is_main_owner|=/,
        );
      }
    });
  });
});

describe('🚨 quem entra mostra espécie e raça', () => {
  it('cada pet leva espécie, raça e o vínculo que o justifica', async () => {
    // Telefone, nome do tutor e nome do pet não dizem se o público faz sentido:
    // "Ricota" pode ser o gato que não devia estar num disparo de cachorro, e
    // nada na linha acusa.
    query.mockResolvedValueOnce([linha()]);
    const r = await montarPublico({});
    const pet = r.tutores[0].pets[0];
    expect(pet.especie).toBe('Cachorro');
    expect(pet.raca).toBe('Maltês');
    expect(pet.vinculo).toBe('Principal Responsável');
  });

  it('🚨 a raça legível é o rótulo, não o nome do catálogo', async () => {
    // Medido em prod: `name` é o inglês ("Maltese", "French Bulldog",
    // "Pomeranian") e `label` é o que a pessoa reconhece. Mostrar `name` numa
    // tela em português funciona pra Pug e falha justo nas raças traduzidas.
    query.mockResolvedValueOnce([linha({ raca_rotulo: 'Lulu da Pomerânia', raca_nome: 'Pomeranian' })]);
    const r = await montarPublico({});
    expect(r.tutores[0].pets[0].raca).toBe('Lulu da Pomerânia');
  });

  it('pet sem raça cadastrada não inventa uma', async () => {
    query.mockResolvedValueOnce([linha({ raca_rotulo: null, raca_nome: null })]);
    const r = await montarPublico({});
    expect(r.tutores[0].pets[0].raca).toBeNull();
  });
});

describe('normalizarRegras e o vínculo', () => {
  it('o padrão mudou de "qualquer" pra "dono"', () => {
    expect(normalizarRegras({}).vinculo).toBe('dono');
  });

  it('aceita o nome de um tipo, e recusa lixo', () => {
    expect(normalizarRegras({ vinculo: 'veterinarian' }).vinculo).toBe('veterinarian');
    expect(normalizarRegras({ vinculo: 'DROP TABLE' }).vinculo).toBe('dono');
    expect(normalizarRegras({ vinculo: 42 }).vinculo).toBe('dono');
  });
});
