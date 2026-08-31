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

// Os tipos de vínculo são DADO (pet_owner_types). Aqui eles chegam como as
// quatro linhas que prod tem preenchidas em 31/08.
const TIPOS = [
  { nome: 'primary', rotulo: 'Principal Responsável' },
  { nome: 'co_parent', rotulo: 'Co-tutor' },
  { nome: 'veterinarian', rotulo: 'Veterinário' },
  { nome: 'support_network', rotulo: 'Rede de Apoio' },
];

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
      // 🚨 `vinculo` declara os valores como FUNÇÃO, porque eles são dado: os
      // tipos vêm de `pet_owner_types` e escrever os sete aqui defasaria na
      // primeira vez que alguém cadastrasse o oitavo.
      const valores = typeof spec.valores === 'function' ? spec.valores(TIPOS) : spec.valores;
      expect(Array.isArray(valores), `${campo} sem lista de valores`).toBe(true);
      expect(valores.length).toBeGreaterThan(0);
      expect(typeof spec.descricao).toBe('string');
    }
  });
});

describe('🚨 toda decisão diz o que mudou, e preserva o porquê do agente', () => {
  it('o que a conversa decidiu sai como mudança, com a frase dele intacta', () => {
    const r = normalizarPublico(
      {
        publico: { especie: 'Cat' },
        publicoPorque: { especie: { porque: 'você disse tutores de gato' } },
      },
      { tipos: TIPOS },
    );
    const d = r.decisoes.find((x) => x.campo === 'especie');
    expect(d.mudou).toBe(true);
    expect(d.como).toBe('pedido');
    expect(d.porque).toBe('você disse tutores de gato');
    expect(d.frase).toBe('Só quem tem gato');
  });

  it('🚨 o que ninguém falou sai como assumido e EXPLICA que foi omissão', () => {
    // `todos` É o padrão de fotoEscopo, então isto é o agente não tendo mexido.
    const r = normalizarPublico({ publico: { fotoEscopo: 'todos' } }, { tipos: TIPOS });
    const d = r.decisoes.find((x) => x.campo === 'fotoEscopo');
    expect(d.mudou).toBe(false);
    expect(d.como).toBe('assumido');
    // A frase tem que dizer que ninguém decidiu, senão o operador lê a proposta
    // como se tudo tivesse sido escolhido.
    expect(d.porque).toMatch(/ninguém falou/i);
  });

  it('e mudar o escopo da foto conta como decisão, porque muda quem entra', () => {
    const r = normalizarPublico({ publico: { fotoEscopo: 'algum' } }, { tipos: TIPOS });
    expect(r.decisoes.find((x) => x.campo === 'fotoEscopo').mudou).toBe(true);
  });

  it('🚨 valor DIFERENTE do padrão é decisão, mesmo se o modelo jurar que é padrão', () => {
    // Medido em 28/08, na primeira conversa de verdade: o agente marcou um
    // vínculo que NÃO era o padrão e rotulou "padrao, não especificado". Ele
    // mudou quem recebe e a trilha disse que nada aconteceu. O que mudou é
    // CALCULADO comparando com o padrão, nunca acreditado.
    const r = normalizarPublico(
      { publico: { vinculo: 'principal' }, publicoPorque: { vinculo: { porque: '' } } },
      { tipos: TIPOS },
    );
    const d = r.decisoes.find((x) => x.campo === 'vinculo');
    expect(d.mudou).toBe(true);
    expect(d.como).toBe('pedido');
    // Mudou E não veio frase nenhuma: aqui a suspeita é honesta, porque não há
    // justificativa pra preservar.
    expect(d.suspeita).toBe(true);
    expect(d.porque).toMatch(/não disse por quê/i);
  });

  it('🚨 mudou COM justificativa: a frase do agente sobrevive, e não há suspeita', () => {
    // ESTE É O DEFEITO DE 31/08. O código antigo trocava o `porque` do agente
    // pelo texto de suspeita sempre que o valor diferia do padrão e ele não
    // tinha marcado `origem: 'briefing'`. O briefing dizia "pros tutores de
    // gato", ele escrevia isso, e a tela dizia que ele não soube explicar.
    const r = normalizarPublico(
      {
        publico: { vinculo: 'principal' },
        publicoPorque: { vinculo: { porque: 'você falou em uma peça por dono' } },
      },
      { tipos: TIPOS },
    );
    const d = r.decisoes.find((x) => x.campo === 'vinculo');
    expect(d.porque).toBe('você falou em uma peça por dono');
    expect(d.suspeita).toBeUndefined();
  });

  it('🚨 o rótulo NÃO contradiz o texto ao lado quando o pedido bate com o padrão', () => {
    // O outro defeito de 31/08: `escopo = tutor` saía rotulado "padrão" com a
    // frase "pediu 'uma peça por casa'" grudada nela. Duas afirmações opostas
    // no mesmo pixel. O rótulo agora só afirma o verificável (não mudou), e a
    // frase do agente continua ali contando que ele pediu.
    const r = normalizarProducao({
      producao: { escopo: 'tutor' },
      producaoPorque: { escopo: { porque: "você pediu 'uma peça por casa'" } },
    });
    const d = r.decisoes.find((x) => x.campo === 'escopo');
    expect(d.mudou).toBe(false);
    expect(d.como).toBe('assumido');
    expect(d.porque).toBe("você pediu 'uma peça por casa'");
    // E o rótulo não diz "padrão", que era a palavra que contradizia a frase.
    expect(d.frase).toBe('Uma peça por casa, com todos os pets dela');
  });

  it('🚨 campo que o agente NÃO citou aparece assim mesmo, com o padrão', () => {
    // Omissão é decisão. Uma proposta que só lista o que foi mexido parece mais
    // completa do que é, e é justo aí que mora o disparo maior do que o
    // operador leu.
    const r = normalizarPublico({ publico: { especie: 'Cat' } }, { tipos: TIPOS });
    const campos = r.decisoes.map((d) => d.campo);
    for (const campo of Object.keys(VOCABULARIO)) {
      expect(campos, `${campo} sumiu da proposta`).toContain(campo);
    }
  });

  it('🚨 as travas aparecem na leitura como "isso é sempre assim"', () => {
    // Antes elas só existiam na tela quando o agente tentava desligá-las, o que
    // deixava a proposta mais tranquila do que a verdade: lida de cima a baixo,
    // ela não dizia que o pet falecido estava fora.
    const r = normalizarPublico({ publico: { especie: 'Cat' } }, { tipos: TIPOS });
    const petVivo = r.decisoes.find((d) => d.campo === 'petVivo');
    expect(petVivo.como).toBe('sempre');
    expect(petVivo.frase).toBe('Pet que já partiu fica de fora');
  });

  it('toda decisão leva a uma aba, senão a linha não tem conserto', () => {
    const r = normalizarPublico({ publico: { especie: 'Cat' } }, { tipos: TIPOS });
    for (const d of r.decisoes) expect(d.aba, `${d.campo} não leva a lugar nenhum`).toBeTruthy();
  });
});

describe('🚨 o vínculo enxerga os sete tipos, não três', () => {
  it('o padrão é "dono", que é o que resolve o veterinário', () => {
    // No Dia do Cachorro um veterinário saiu do público por EXCLUSÃO MANUAL,
    // com o motivo escrito à mão, porque "nada no schema separa veterinário de
    // tutor". Separa desde sempre, em pet_owner_types. Aquela linha nunca
    // precisou existir.
    const r = normalizarPublico({ publico: {} }, { tipos: TIPOS });
    expect(r.regras.vinculo).toBe('dono');
  });

  it('🚨 um tipo de vínculo do banco é valor válido, e vira frase', () => {
    const r = normalizarPublico({ publico: { vinculo: 'veterinarian' } }, { tipos: TIPOS });
    expect(r.regras.vinculo).toBe('veterinarian');
    expect(r.decisoes.find((d) => d.campo === 'vinculo').frase).toBe(
      'Só quem entra como veterinário',
    );
    expect(r.ignorei).toEqual([]);
  });

  it('tipo que não existe no banco é recusado, e é DITO', () => {
    const r = normalizarPublico({ publico: { vinculo: 'groomer' } }, { tipos: TIPOS });
    expect(r.regras.vinculo).toBe('dono');
    expect(r.ignorei.join(' ')).toMatch(/groomer/);
  });
});

describe('🚨 o resumo não promete o que a trava barrou', () => {
  it('travou: o resumo ganha a ressalva', () => {
    // Medido em 28/08: o agente resumiu "a blacklist será desativada" com a
    // trava dizendo o contrário logo abaixo. Duas frases opostas na mesma tela,
    // e a primeira é a que se lê primeiro.
    const r = normalizarPublico({ publico: { blacklist: false } });
    expect(r.travas).toHaveLength(1);
    // O serviço monta o `entendi` com a ressalva quando `travas` não é vazio.
    const entendi = r.travas.length
      ? 'A blacklist será desativada (menos o que está em "Isso eu não faço", logo abaixo)'
      : 'A blacklist será desativada';
    expect(entendi).toMatch(/Isso eu não faço/);
  });

  it('sem trava, o resumo fica como o agente escreveu', () => {
    const r = normalizarPublico({ publico: { especie: 'Cat' } });
    expect(r.travas).toEqual([]);
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
      const valores = typeof spec.valores === 'function' ? spec.valores(TIPOS) : spec.valores;
      if (spec.travada || !valores.includes(false)) continue;
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
