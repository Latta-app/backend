/* ============================================================================
 * ONDE A CAMPANHA PAROU
 * ============================================================================
 *
 * O nome sozinho não responde a pergunta que se faz ao abrir a seção, que é
 * "qual eu estava montando, e em que pé ela está". Uma campanha com o público
 * congelado e nenhuma peça é uma coisa; a mesma com 69 peças aprovadas e zero
 * enviadas é outra bem diferente — e as duas se chamam igual na lista.
 *
 * 🚨 O ESTÁGIO É O DEGRAU MAIS LONGE ALCANÇADO, e não o próximo a fazer. A
 * diferença importa quando o meio do caminho está incompleto: uma campanha com
 * 69 peças e 3 aprovadas mostra "3 aprovadas", porque foi até ali que alguém
 * chegou. Mostrar "faltam 66 pra aprovar" seria escolher o pessimismo por
 * ela — e a tela não sabe se as outras 66 foram descartadas de propósito.
 * ============================================================================ */

const n = (v) => Number(v ?? 0);

/**
 * A escada, do topo pra base. O primeiro que casa vence.
 *
 * Ordem = ordem do trabalho real. Mexer aqui sem mexer no fluxo faz a lista
 * contar uma história diferente da que as abas contam.
 */
const DEGRAUS = [
  {
    id: 'enviada',
    quando: (c) => n(c.enviadas) > 0,
    rotulo: (c) =>
      n(c.enviadas) === n(c.pecas_aprovadas)
        ? `${n(c.enviadas)} enviadas`
        : `${n(c.enviadas)} de ${n(c.pecas_aprovadas)} enviadas`,
    tom: 'enviada',
  },
  {
    id: 'aprovada',
    quando: (c) => n(c.pecas_aprovadas) > 0,
    rotulo: (c) => `${n(c.pecas_aprovadas)} aprovadas, nada enviado`,
    tom: 'pronta',
  },
  {
    id: 'com_pecas',
    quando: (c) => n(c.pecas_prontas) > 0,
    rotulo: (c) => `${n(c.pecas_prontas)} peças, nenhuma aprovada`,
    tom: 'andamento',
  },
  {
    id: 'direcao',
    quando: (c) => !!c.direcao_aprovada,
    rotulo: () => 'direção aprovada, sem peças',
    tom: 'andamento',
  },
  {
    id: 'publico',
    quando: (c) => n(c.audiencia_congelada) > 0,
    rotulo: (c) => `${n(c.audiencia_congelada)} tutores congelados`,
    tom: 'andamento',
  },
  {
    id: 'rascunho',
    quando: () => true,
    rotulo: () => 'rascunho',
    tom: 'rascunho',
  },
];

export const ondeParou = (campanha) => {
  const c = campanha ?? {};
  const degrau = DEGRAUS.find((d) => d.quando(c));
  return {
    id: degrau.id,
    rotulo: degrau.rotulo(c),
    tom: degrau.tom,
    // 🚨 Alerta é SEPARADO do estágio, e some junto com ele seria o erro: uma
    // campanha pode ter chegado longe E ter peças quebradas pelo caminho. Quem
    // olha a lista precisa das duas informações, não da mais bonita.
    alerta: n(c.pecas_com_erro) > 0 ? `${n(c.pecas_com_erro)} peças falharam` : null,
  };
};

export default { ondeParou };
