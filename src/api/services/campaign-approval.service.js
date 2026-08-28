/* ============================================================================
 * APROVAÇÃO — o que CADA PESSOA vai receber, junto
 * ============================================================================
 *
 * O último portão antes do Destino, e o único lugar onde as três peças da
 * mensagem aparecem no mesmo lugar:
 *
 *   a ARTE          (que pode ter o cachorro de outra casa)
 *   o TEXTO         (que pode chamar a cadela de "ele")
 *   o LINK          (que pode apontar pro nada)
 *
 * 🚨 POR QUE ELAS PRECISAM APARECER JUNTAS. Cada uma tem a sua tela de
 * conferência antes daqui, e cada uma passa sozinha: a peça está bonita, o texto
 * está correto, o link está formado. O que ninguém confere é a COMBINAÇÃO — e é
 * ela que chega no aparelho. Uma peça certa com o texto de outro gênero é uma
 * mensagem errada, e as duas telas anteriores dizem que está tudo bem.
 *
 * É a "conferência de saída" que a conversa não tem, aplicada ao disparo.
 * ============================================================================ */

import { sequelize } from '../../config/database.js';
import { QueryTypes } from 'sequelize';
import { resolverTemplate } from './campaign-template.service.js';

const LANDING = 'https://latta.app.br';

/**
 * Junta peça, texto e link por tutor.
 *
 * 🚨 A junção é por TELEFONE, e não por posição nas duas listas. Duas listas
 * ordenadas do mesmo jeito parecem casar até uma delas perder uma linha — e aí
 * a peça de um tutor aparece com o texto do vizinho, que é exatamente o defeito
 * que esta tela existe pra pegar.
 */
export const montarAprovacao = async (campaignId, { corpo, variaveis, slug } = {}) => {
  const pecas = await sequelize.query(
    `SELECT id, cell_phone, pets, status, url, token, modo, erro,
            revisao, revisao_motivo, referencias
       FROM campaign_pieces
      WHERE campaign_id = :id
      ORDER BY cell_phone`,
    { type: QueryTypes.SELECT, replacements: { id: campaignId } },
  );

  // O texto só existe se houver template escolhido. Sem ele a tela ainda serve
  // pra arte e pro link — dizer "não dá pra conferir nada" porque falta uma das
  // três seria esconder as outras duas.
  let porTelefone = new Map();
  let semTemplate = true;
  if (corpo) {
    const resolvido = await resolverTemplate(campaignId, { corpo, variaveis });
    porTelefone = new Map(resolvido.linhas.map((l) => [l.telefone, l]));
    semTemplate = false;
  }

  const linhas = pecas.map((p) => {
    const t = porTelefone.get(p.cell_phone) ?? null;
    // 🚨 O link só existe com token E com slug. Montar `/undefined/xyz` daria um
    // link que parece link e leva pro nada — pior que link nenhum, porque o
    // operador aprova achando que conferiu.
    const link = slug && p.token ? `${LANDING}/${slug}/${p.token}` : null;

    const pendencias = [
      ...(p.status !== 'pronta' ? [`a peça ${p.status === 'erro' ? 'falhou' : 'ainda não saiu'}`] : []),
      ...(semTemplate ? ['nenhum template escolhido, então não dá pra ver o texto'] : []),
      ...(t && !t.pronta ? t.bloqueios : []),
      ...(t ? [] : semTemplate ? [] : ['esta casa não aparece na prévia do template']),
      ...(link ? [] : ['sem link de compartilhamento']),
    ];

    return {
      id: p.id,
      telefone: p.cell_phone,
      pets: (p.pets || []).map((x) => x.nome),
      arte: p.url,
      modo: p.modo,
      erro: p.erro,
      referencias: p.referencias || [],
      texto: t?.texto ?? null,
      forma: t?.forma ?? null,
      link,
      revisao: p.revisao,
      revisaoMotivo: p.revisao_motivo,
      pendencias,
      // 🚨 "Inteira" quer dizer as TRÊS partes prontas. Uma peça pronta com
      // texto bloqueado não é uma mensagem que dá pra aprovar.
      inteira: pendencias.length === 0,
    };
  });

  const conta = (fn) => linhas.filter(fn).length;
  return {
    total: linhas.length,
    inteiras: conta((l) => l.inteira),
    aprovadas: conta((l) => l.revisao === 'aprovada'),
    reprovadas: conta((l) => l.revisao === 'reprovada'),
    semRevisao: conta((l) => l.inteira && !l.revisao),
    semTemplate,
    linhas,
  };
};

export default { montarAprovacao };
