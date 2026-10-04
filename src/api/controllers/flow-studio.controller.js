/* ============================================================================
 * ESTÚDIO DE FLOWS — cockpit
 * ============================================================================
 *
 * Duas tabelas, e esta API só faz duas coisas com elas:
 *
 * 1. LÊ `flow_studio_snapshots`. Quem publica snapshot é outra frente (um
 *    script que roda a partir do repo dos Flows); aqui ninguém escreve nela.
 *
 * 2. GRAVA e LISTA `flow_studio_edits`, os pedidos de mudança. O operador só
 *    cria e DESCARTA; andar com o pedido (em_andamento → aplicada) é da sessão
 *    que aplica, e não tem rota aqui.
 *
 * As decisões (validação, filtro, ordem, montagem do INSERT) moram em
 * `services/flow-studio.service.js`, puras e testadas sem banco.
 * ============================================================================ */

import { randomUUID } from 'node:crypto';
import { QueryTypes } from 'sequelize';
import { sequelize } from '../../config/database.js';
import {
  COLUNAS_DO_PEDIDO,
  ehUuid,
  lerFiltroDeStatus,
  montarInsertDePedidos,
  ordenarFlows,
  pedidoParaApi,
  snapshotParaApi,
  validarLote,
} from '../services/flow-studio.service.js';

const COLUNAS = COLUNAS_DO_PEDIDO.join(', ');

const erroInterno = (res, onde, err) => {
  // eslint-disable-next-line no-console
  console.error(`[flow-studio] ${onde} failed:`, err.message);
  return res.status(500).json({ code: 'FLOW_STUDIO_ERROR', message: err.message });
};

/**
 * O snapshot mais recente de cada Flow, SEM o `flow_json`.
 *
 * 🚨 O json fica de fora de propósito: ele carrega as imagens em base64 e passa
 * de megabytes por Flow. A lista só precisa do que vai no seletor.
 */
export const listarFlows = async (_req, res) => {
  try {
    const rows = await sequelize.query(
      `SELECT DISTINCT ON (flow_key) id, flow_key, nome, git_sha, telas, created_at
         FROM flow_studio_snapshots
        ORDER BY flow_key, created_at DESC`,
      { type: QueryTypes.SELECT },
    );
    const flows = ordenarFlows(rows.map((r) => snapshotParaApi(r)));
    return res.json({ code: 'FLOW_STUDIO_FLOWS', data: flows });
  } catch (err) {
    return erroInterno(res, 'list flows', err);
  }
};

/** O snapshot mais recente de UM Flow, com o json inteiro. */
export const lerFlow = async (req, res) => {
  try {
    const rows = await sequelize.query(
      `SELECT id, flow_key, nome, git_sha, telas, created_at, flow_json
         FROM flow_studio_snapshots
        WHERE flow_key = :flowKey
        ORDER BY created_at DESC
        LIMIT 1`,
      { type: QueryTypes.SELECT, replacements: { flowKey: req.params.flowKey } },
    );
    if (!rows.length) {
      return res.status(404).json({
        code: 'FLOW_STUDIO_FLOW_NOT_FOUND',
        message: `Nenhum snapshot publicado para o flow "${req.params.flowKey}"`,
      });
    }
    return res.json({
      code: 'FLOW_STUDIO_FLOW',
      data: snapshotParaApi(rows[0], { comJson: true }),
    });
  } catch (err) {
    return erroInterno(res, 'get flow', err);
  }
};

/** Os pedidos, do mais novo pro mais velho, com filtro opcional por flow e status. */
export const listarPedidos = async (req, res) => {
  const filtro = lerFiltroDeStatus(req.query.status);
  if (filtro.erro) {
    return res.status(400).json({ code: 'FLOW_STUDIO_STATUS_INVALIDO', message: filtro.erro });
  }
  const flowKey = typeof req.query.flowKey === 'string' ? req.query.flowKey.trim() : '';

  const condicoes = [];
  const replacements = {};
  if (flowKey) {
    condicoes.push('flow_key = :flowKey');
    replacements.flowKey = flowKey;
  }
  if (filtro.status) {
    condicoes.push('status IN (:status)');
    replacements.status = filtro.status;
  }
  const where = condicoes.length ? `WHERE ${condicoes.join(' AND ')}` : '';

  try {
    const rows = await sequelize.query(
      `SELECT ${COLUNAS}
         FROM flow_studio_edits
         ${where}
        ORDER BY created_at DESC
        LIMIT 500`,
      { type: QueryTypes.SELECT, replacements },
    );
    return res.json({ code: 'FLOW_STUDIO_EDITS', data: rows.map(pedidoParaApi) });
  } catch (err) {
    return erroInterno(res, 'list edits', err);
  }
};

/**
 * Grava um LOTE de pedidos: tudo que o operador mandou de uma vez ganha o MESMO
 * `lote_id`, que é como a sessão que aplica sabe o que foi pedido junto.
 *
 * O autor sai do JWT (`req.user`), nunca do corpo. O token desta casa carrega
 * `id` e `email`, e não o nome — então `autor_nome` guarda o e-mail.
 */
export const criarPedidos = async (req, res) => {
  const validacao = validarLote(req.body);
  if (!validacao.ok) {
    return res.status(400).json({
      code: 'FLOW_STUDIO_PEDIDO_INVALIDO',
      message: validacao.mensagem,
      indice: validacao.indice,
      campo: validacao.campo,
    });
  }

  const loteId = randomUUID();
  const { sql, replacements } = montarInsertDePedidos({
    loteId,
    flowKey: req.body.flowKey,
    snapshotId: req.body.snapshotId,
    edits: req.body.edits,
    autorId: req.user?.id,
    autorNome: req.user?.email,
  });

  try {
    const rows = await sequelize.query(sql, { type: QueryTypes.SELECT, replacements });
    return res.status(201).json({
      code: 'FLOW_STUDIO_EDITS_CREATED',
      data: { loteId, ids: rows.map((r) => r.id) },
    });
  } catch (err) {
    return erroInterno(res, 'create edits', err);
  }
};

/**
 * O operador só DESCARTA, e só pedido PENDENTE.
 *
 * 🚨 A condição de status mora no WHERE do UPDATE, e não num SELECT antes dele:
 * entre ler "pendente" e gravar "descartada" a sessão que aplica pode ter pego o
 * pedido. O SELECT de depois só serve pra dizer POR QUE não atualizou.
 */
export const descartarPedido = async (req, res) => {
  const { id } = req.params;
  if (req.body?.status !== 'descartada') {
    return res.status(400).json({
      code: 'FLOW_STUDIO_STATUS_INVALIDO',
      message: 'o operador só pode mudar o status para "descartada"',
    });
  }
  // Um id que não é uuid derrubaria a consulta com erro de tipo (500). Ele não
  // existe por construção, mas o erro honesto é dizer que o id está torto.
  if (!ehUuid(id)) {
    return res
      .status(400)
      .json({ code: 'FLOW_STUDIO_ID_INVALIDO', message: 'id precisa ser um uuid' });
  }

  try {
    const rows = await sequelize.query(
      `UPDATE flow_studio_edits
          SET status = 'descartada', updated_at = NOW()
        WHERE id = :id AND status = 'pendente'
        RETURNING ${COLUNAS}`,
      { type: QueryTypes.SELECT, replacements: { id } },
    );
    if (rows.length) {
      return res.json({ code: 'FLOW_STUDIO_EDIT_DESCARTADO', data: pedidoParaApi(rows[0]) });
    }

    const atual = await sequelize.query(`SELECT status FROM flow_studio_edits WHERE id = :id`, {
      type: QueryTypes.SELECT,
      replacements: { id },
    });
    if (!atual.length) {
      return res
        .status(404)
        .json({ code: 'FLOW_STUDIO_EDIT_NOT_FOUND', message: 'pedido não encontrado' });
    }
    return res.status(409).json({
      code: 'FLOW_STUDIO_EDIT_NAO_PENDENTE',
      message: `só pedido pendente pode ser descartado; este está "${atual[0].status}"`,
      status: atual[0].status,
    });
  } catch (err) {
    return erroInterno(res, 'discard edit', err);
  }
};
