// O Agente de Campanha: o vocabulário fechado, as quatro travas e a auditoria.
//
// ── O ALCANCE ──────────────────────────────────────────────────────────────
// PEGA:
//   · 🚨 as QUATRO TRAVAS cedendo à prosa. São as regras que machucam gente de
//     verdade quando desligadas: pet vivo (a homenagem citaria o animal que
//     morreu), não perturbe (escreve pra quem pediu silêncio), personas de
//     teste (infla o número), e exclusão manual (o agente inventando um motivo
//     que deveria ser de um humano). Um briefing que peça qualquer uma delas
//     tem que bater na cerca E aparecer na resposta;
//   · 🚨 regra ou valor INVENTADO virando marcação. É o defeito mais silencioso
//     possível: uma regra com nome plausível que não existe não filtra nada, o
//     funil parece coerente, e o disparo sai maior do que o operador leu;
//   · decisão saindo sem dizer se veio da conversa ou do padrão. Sem isso a
//     conferência é impossível: o operador revisa o que está escrito em vez de
//     revisar o que foi decidido por omissão;
//   · variável de template com fonte inventada, ou apontando pra {{n}} que não
//     existe no corpo — os dois resolvem pra vazio e mandam "Oi , tudo bem?";
//   · o teto de perguntas sendo tratado como sugestão;
//   · slug de página com acento ou espaço (quebra o proxy da arte em silêncio).
// NÃO PEGA:
//   · se a proposta é BOA. Isso é o operador na tela de conferência, e é o
//     ponto inteiro do desenho;
//   · se o modelo respondeu — o provider é mockado aqui.
import { describe, it, expect, vi } from 'vitest';

vi.mock('../../config/database.js', () => ({ sequelize: { query: vi.fn(async () => []) } }));
vi.mock('../../config/postgres.js', () => ({ pgQuery: vi.fn(async () => ({ rows: [] })) }));

import {
  normalizarPublico,
  normalizarProducao,
  normalizarVariaveis,
  normalizarPagina,
  encurtarCatalogo,
  slugDaPagina,
  VOCABULARIO,
  TRAVAS,
  TETO_DE_PERGUNTAS,
} from '../services/campaign-briefing.service.js';

describe('🚨 as quatro travas não cedem à prosa', () => {
  it('as travas são exatamente as três regras de público mais a exclusão manual', () => {
    expect(TRAVAS.sort()).toEqual(['blacklist', 'personasTeste', 'petVivo']);
  });

  it('🚨 "manda pra todo mundo, sem exceção" NÃO desliga o não perturbe', () => {
    const r = normalizarPublico({ publico: { blacklist: false } });
    expect(r.regras.blacklist).toBe(true);
    // E a cerca APARECE: uma trava silenciosa é indistinguível de um bug.
    expect(r.travas.map((t) => t.campo)).toContain('blacklist');
    expect(r.travas[0].recado).toMatch(/pediu/i);
  });

  it('🚨 "inclui os pets que já se foram" NÃO desliga o pet vivo', () => {
    const r = normalizarPublico({ publico: { petVivo: false } });
    expect(r.regras.petVivo).toBe(true);
    expect(r.travas.map((t) => t.campo)).toContain('petVivo');
  });

  it('🚨 "pode mandar pros números de teste também" NÃO desliga as personas', () => {
    const r = normalizarPublico({ publico: { personasTeste: false } });
    expect(r.regras.personasTeste).toBe(true);
    expect(r.travas.map((t) => t.campo)).toContain('personasTeste');
  });

  it('🚨 o agente NUNCA inventa exclusão manual', () => {
    const r = normalizarPublico({
      publico: { exclusoes: [{ telefone: '5531999300962', motivo: 'parece veterinário' }] },
    });
    // A exclusão guarda telefone e um motivo que existe pra ser auditável seis
    // meses depois. Escrito por máquina, ele é o álibi que a coluna tenta impedir.
    expect(r.regras.exclusoes).toEqual([]);
  });

  it('as três travas ficam ligadas mesmo quando ninguém falou delas', () => {
    const r = normalizarPublico({ publico: { especie: 'Cat' } });
    expect(r.regras.blacklist).toBe(true);
    expect(r.regras.petVivo).toBe(true);
    expect(r.regras.personasTeste).toBe(true);
    expect(r.travas).toEqual([]);
  });
});

describe('🚨 o vocabulário é fechado', () => {
  it('regra inventada não vira marcação, e é DITA', () => {
    const r = normalizarPublico({ publico: { tutorEngajado: true, especie: 'Dog' } });
    expect(r.regras.tutorEngajado).toBeUndefined();
    expect(r.ignorei.join(' ')).toMatch(/tutorEngajado/);
  });

  it('valor inventado num campo que existe cai no padrão, e é DITO', () => {
    const r = normalizarPublico({ publico: { especie: 'Hamster' } });
    // Cai no default de normalizarRegras, que é Dog — nunca em "Hamster".
    expect(r.regras.especie).toBe('Dog');
    expect(r.ignorei.join(' ')).toMatch(/Hamster/);
  });

  it('escopo de produção inventado cai em "tutor", e é DITO', () => {
    const r = normalizarProducao({ producao: { escopo: 'clinica' } });
    expect(r.valores.escopo).toBe('tutor');
    expect(r.ignorei.join(' ')).toMatch(/clinica/);
  });

  it('todo campo do vocabulário declara os valores que aceita', () => {
    for (const [campo, spec] of Object.entries(VOCABULARIO)) {
      expect(Array.isArray(spec.valores), `${campo} sem lista de valores`).toBe(true);
      expect(spec.valores.length).toBeGreaterThan(0);
      expect(typeof spec.descricao).toBe('string');
    }
  });
});

describe('🚨 toda decisão diz de onde veio', () => {
  it('o que a conversa decidiu sai como "briefing", com o porquê', () => {
    const r = normalizarPublico({
      publico: { especie: 'Cat' },
      publicoPorque: { especie: { origem: 'briefing', porque: 'você disse tutores de gato' } },
    });
    const d = r.decisoes.find((x) => x.campo === 'especie');
    expect(d.origem).toBe('briefing');
    expect(d.porque).toMatch(/gato/);
  });

  it('🚨 o que ninguém falou sai como "padrao" e EXPLICA que foi omissão', () => {
    // `todos` É o padrão de fotoEscopo, então isto é o agente não tendo mexido.
    const r = normalizarPublico({ publico: { fotoEscopo: 'todos' } });
    const d = r.decisoes.find((x) => x.campo === 'fotoEscopo');
    expect(d.origem).toBe('padrao');
    // A frase tem que dizer que ninguém decidiu, senão o operador lê a proposta
    // como se tudo tivesse sido escolhido.
    expect(d.porque).toMatch(/ninguém falou/i);
  });

  it('e mudar o escopo da foto conta como decisão, porque muda quem entra', () => {
    const r = normalizarPublico({ publico: { fotoEscopo: 'algum' } });
    expect(r.decisoes.find((x) => x.campo === 'fotoEscopo').origem).toBe('briefing');
  });

  it('🚨 valor DIFERENTE do padrão é decisão, mesmo se o modelo jurar que é padrão', () => {
    // Medido em 28/08, na primeira conversa de verdade: o agente marcou
    // `vinculo = principal` (o padrão é `qualquer`) e rotulou "padrao, não
    // especificado". Ele mudou quem recebe e a trilha disse que nada aconteceu.
    // A origem é CALCULADA comparando com o padrão, não acreditada.
    const r = normalizarPublico({
      publico: { vinculo: 'principal' },
      publicoPorque: { vinculo: { origem: 'padrao', porque: 'não especificado' } },
    });
    const d = r.decisoes.find((x) => x.campo === 'vinculo');
    expect(d.origem).toBe('briefing');
    // 🚨 E a incoerência vira aviso: é o texto que o operador lê, e ele não
    // pode continuar dizendo "não especificado" num campo que mudou.
    expect(d.suspeita).toBe(true);
    expect(d.porque).toMatch(/não soube dizer por quê/i);
  });

  it('valor IGUAL ao padrão continua padrão, se o modelo não disser o contrário', () => {
    const r = normalizarPublico({
      publico: { vinculo: 'qualquer' },
      publicoPorque: { vinculo: { origem: 'deduzi', porque: 'achei' } },
    });
    expect(r.decisoes.find((x) => x.campo === 'vinculo').origem).toBe('padrao');
  });
});

describe('🚨 desligar regra que não é travada AVISA o estrago', () => {
  it('sem foto própria, a peça mostra a ilustração da raça e a tela diz isso', () => {
    // Medido em 28/08: o agente desligou esta regra sozinho a partir de um
    // "manda pra todo mundo" que falava da blacklist. Ele PODE desligar; o que
    // não pode é o estrago ser silencioso.
    const r = normalizarPublico({ publico: { fotoPropria: false } });
    expect(r.regras.fotoPropria).toBe(false);
    const aviso = r.avisos.find((a) => a.campo === 'fotoPropria');
    expect(aviso).toBeTruthy();
    expect(aviso.recado).toMatch(/ilustração genérica|outro bicho/i);
  });

  it('sem dedup, o pet sai clonado, e a tela diz isso', () => {
    const r = normalizarPublico({ publico: { dedupNome: false } });
    expect(r.avisos.find((a) => a.campo === 'dedupNome').recado).toMatch(/clonado/i);
  });

  it('regra LIGADA não avisa nada', () => {
    expect(normalizarPublico({ publico: { fotoPropria: true } }).avisos).toEqual([]);
  });

  it('toda regra que dá pra desligar tem o aviso escrito', () => {
    for (const [campo, spec] of Object.entries(VOCABULARIO)) {
      if (spec.travada || !spec.valores.includes(false)) continue;
      expect(typeof spec.avisoSeDesligada, `${campo} pode ser desligada e não avisa nada`).toBe(
        'string',
      );
    }
  });
});

describe('🚨 as variáveis do template', () => {
  it('fonte inventada é recusada, e é DITA', () => {
    const r = normalizarVariaveis({ 1: { fonte: 'raca_do_pet' } }, ['1']);
    expect(r.variaveis['1']).toBeUndefined();
    expect(r.ignorei.join(' ')).toMatch(/raca_do_pet/);
  });

  it('variável pra {{n}} que não existe no corpo é recusada', () => {
    const r = normalizarVariaveis({ 7: { fonte: 'tutor' } }, ['1', '2']);
    expect(r.variaveis['7']).toBeUndefined();
    expect(r.ignorei.join(' ')).toMatch(/\{\{7\}\}/);
  });

  it('🚨 {{n}} do corpo que ficou sem fonte vira lacuna DECLARADA', () => {
    // Sem isso a variável resolve vazia e o tutor recebe "Oi , tudo bem?".
    const r = normalizarVariaveis({ 1: { fonte: 'tutor' } }, ['1', '2']);
    expect(r.faltando.join(' ')).toMatch(/\{\{2\}\}/);
  });

  it('as quatro formas de gênero passam inteiras', () => {
    const r = normalizarVariaveis(
      { 1: { fonte: 'genero', m: 'pro {pets}', f: 'pra {pets}', mp: 'pros {pets}', fp: 'pras {pets}' } },
      ['1'],
    );
    expect(r.variaveis['1']).toMatchObject({ fonte: 'genero', mp: 'pros {pets}' });
  });
});

describe('a lista curta de templates', () => {
  const catalogo = {
    dia_do_cachorro_v2: { label: 'Dia do cachorro', category: 'MARKETING', body: 'homenagem {{1}}' },
    checkin_diario_v6: { label: 'Check-in', category: 'UTILITY', body: 'bom dia {{1}}' },
    petz_conexao: { label: 'Petz', category: 'UTILITY', body: 'conecte sua conta' },
  };

  it('traz quem tem palavra em comum com o pedido', () => {
    const curta = encurtarCatalogo(catalogo, 'campanha de homenagem no dia do cachorro');
    expect(curta.map((t) => t.nome)).toContain('dia_do_cachorro_v2');
  });

  it('deixa de fora quem não tem nada a ver', () => {
    const curta = encurtarCatalogo(catalogo, 'dia do cachorro');
    expect(curta.map((t) => t.nome)).not.toContain('petz_conexao');
  });

  it('respeita o limite, pra lista longa não diluir a escolha', () => {
    expect(encurtarCatalogo(catalogo, 'dia cachorro check conexao conta', 2)).toHaveLength(2);
  });

  it('cada candidato leva as posições do corpo, que é o que o mapa precisa', () => {
    const [t] = encurtarCatalogo(catalogo, 'cachorro');
    expect(t.posicoes).toEqual(['1']);
  });
});

describe('🚨 o slug da página', () => {
  it('tira acento, espaço e maiúscula', () => {
    // Acento funciona no navegador e quebra no `_redirects`, e o sintoma é a
    // arte não carregar pra ninguém.
    expect(slugDaPagina('Dia do Cachorro')).toBe('dia-do-cachorro');
    expect(slugDaPagina('Homenagem à Adoção')).toBe('homenagem-a-adocao');
  });

  it('não deixa traço sobrando na ponta', () => {
    expect(slugDaPagina('  Gato!  ')).toBe('gato');
  });

  it('cai no nome da campanha quando a página não tem slug próprio', () => {
    expect(normalizarPagina({}, 'Dia do Gato').slug).toBe('dia-do-gato');
  });

  it('o botão nunca fica vazio', () => {
    expect(normalizarPagina({ botao: '' }, 'x').botao).toBeTruthy();
  });
});

describe('o teto de perguntas', () => {
  it('existe e é pequeno o bastante pra não virar formulário', () => {
    expect(TETO_DE_PERGUNTAS).toBeGreaterThan(0);
    expect(TETO_DE_PERGUNTAS).toBeLessThanOrEqual(4);
  });
});
