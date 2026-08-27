/* ============================================================================
 * CAMPANHAS — cockpit
 * ============================================================================
 *
 * Duas famílias de endpoint, e a diferença entre elas importa:
 *
 * 1. `preview` NÃO toca em tabela nenhuma. É só o funil de elegibilidade rodado
 *    ao vivo contra o banco. Uma campanha inteira pode ser montada e conferida
 *    sem nunca ser salva, e é o que a primeira fatia da aba de Público faz.
 *
 * 2. O resto persiste em três tabelas (migration 20260827120000).
 *    `campaigns` guarda o conjunto de regras em jsonb (formato aberto de
 *    propósito: as outras cinco abas ainda não existem pra dizer o que precisam
 *    guardar). `campaign_audience` é o snapshot CONGELADO do público.
 *    `campaign_exclusions` é a lista de exclusão manual.
 *
 * 🚨 Por que o snapshot existe: o público é uma consulta viva e a base muda
 * embaixo dele. O funil do Dia do Cachorro deu 67 em 26/08 e dá 68 no dia
 * seguinte, com as mesmas regras, porque um tutor novo se cadastrou. Sem
 * congelar, não há como responder "quem exatamente recebeu aquela peça" depois
 * do disparo.
 *
 * 🚨🚨 Por que a exclusão manual NÃO mora dentro de `campaigns.rules`, que seria
 * o lugar natural: ela guarda TELEFONE, e o motor da porta de saída do titular
 * acha dado pessoal por COLUNA. Telefone enterrado num jsonb ele não alcança, e
 * o classificador do snapshot de PII marcaria `campaigns` como tier "nenhum" com
 * um telefone dentro. Em coluna própria o destino fica `apagar` por telefone,
 * como qualquer outra tabela de contato. Quem mover a exclusão pra dentro do
 * `rules` reabre esse buraco em silêncio.
 * ============================================================================ */

import { sequelize } from '../../config/database.js';
import { QueryTypes } from 'sequelize';
import { montarPublico, normalizarRegras } from '../services/campaign-audience.service.js';
import { conferenciaPreVoo } from '../services/campaign-production.service.js';
import { escolherAlvo, gerarAmostra, subirFundo } from '../services/campaign-piece.service.js';
import {
  aprovarDirecao,
  estadoDoLote,
  iniciarLote,
  revisarPeca,
} from '../services/campaign-batch.service.js';
import { getTemplateCatalog } from '../services/template-catalog.service.js';
import { resolverTemplate, variaveisDoCorpo } from '../services/campaign-template.service.js';

/**
 * Separa o que vai pro jsonb do que vai pra tabela de coluna.
 *
 * O cockpit manda e recebe UM objeto de regras, com as exclusões dentro. Quem
 * quebra em dois é esta camada, e a costura fica aqui pra que nem o frontend nem
 * o motor de regras precisem conhecer a divisão.
 */
const separarExclusoes = (rulesBrutas) => {
  const regras = normalizarRegras(rulesBrutas);
  const { exclusoes, ...semExclusoes } = regras;
  return { regras: semExclusoes, exclusoes };
};

/**
 * `created_by` é uuid, e o `user-id` chega por HEADER.
 *
 * 🚨 Header é entrada do cliente, não identidade provada: qualquer coisa pode
 * vir ali. Jogar o valor cru numa coluna uuid derruba o INSERT inteiro com erro
 * de tipo, e a campanha não é criada por causa de um campo que é só procedência.
 * Medido em 27/08, com um usuário cujo id não era uuid: 500 no create.
 *
 * Quem diz quem é o usuário é o JWT, que o `verifyToken` já validou. Este campo
 * é anotação, então valor que não serve vira NULL em vez de derrubar a operação.
 */
const uuidOuNulo = (valor) => {
  const s = String(valor || '');
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s) ? s : null;
};

const lerExclusoes = async (campaignId, transaction) =>
  sequelize.query(
    `SELECT cell_phone AS telefone, motivo
       FROM campaign_exclusions
      WHERE campaign_id = :id
      ORDER BY created_at`,
    { type: QueryTypes.SELECT, replacements: { id: campaignId }, transaction },
  );

/**
 * Reescreve a lista inteira: apaga e regrava.
 *
 * Diferença incremental (achar quem entrou e quem saiu) daria o mesmo resultado
 * por muito mais código, e a lista tem dezenas de linhas, não milhares.
 */
const gravarExclusoes = async (campaignId, exclusoes, transaction) => {
  await sequelize.query(`DELETE FROM campaign_exclusions WHERE campaign_id = :id`, {
    type: QueryTypes.DELETE,
    replacements: { id: campaignId },
    transaction,
  });
  for (const e of exclusoes) {
    // O motivo é NOT NULL no banco. Uma exclusão sem motivo escrito é
    // exatamente o que a coluna existe pra impedir, então ela é recusada aqui
    // em vez de virar erro de constraint lá embaixo.
    if (!e.motivo) continue;
    await sequelize.query(
      `INSERT INTO campaign_exclusions (campaign_id, cell_phone, motivo)
            VALUES (:id, :telefone, :motivo)
       ON CONFLICT (campaign_id, cell_phone) DO UPDATE SET motivo = EXCLUDED.motivo`,
      {
        type: QueryTypes.INSERT,
        replacements: { id: campaignId, telefone: e.telefone, motivo: e.motivo },
        transaction,
      },
    );
  }
};

/** Devolve pro cockpit o objeto único de regras, com as exclusões de volta. */
const comExclusoes = async (campanha) => ({
  ...campanha,
  rules: { ...(campanha.rules || {}), exclusoes: await lerExclusoes(campanha.id) },
});

/** Pré-visualização do público. Read-only: não escreve nada, nem exige campanha. */
export const previewAudience = async (req, res) => {
  try {
    const resultado = await montarPublico(req.body?.rules);
    return res.json({ code: 'CAMPAIGN_AUDIENCE_PREVIEW', data: resultado });
  } catch (err) {
    console.error('[campaigns] preview failed:', err.message);
    return res.status(500).json({ code: 'AUDIENCE_ERROR', message: err.message });
  }
};

export const listCampaigns = async (_req, res) => {
  try {
    const rows = await sequelize.query(
      `SELECT c.id, c.nome, c.status, c.rules, c.created_at, c.updated_at,
              (SELECT COUNT(*) FROM campaign_audience ca WHERE ca.campaign_id = c.id) AS audiencia_congelada,
              (SELECT COUNT(*) FROM campaign_exclusions ce WHERE ce.campaign_id = c.id) AS exclusoes_manuais
         FROM campaigns c
        ORDER BY c.created_at DESC`,
      { type: QueryTypes.SELECT },
    );
    return res.json({ code: 'CAMPAIGNS_LIST', data: rows });
  } catch (err) {
    console.error('[campaigns] list failed:', err.message);
    return res.status(500).json({ code: 'CAMPAIGNS_ERROR', message: err.message });
  }
};

export const getCampaign = async (req, res) => {
  try {
    const rows = await sequelize.query(
      `SELECT id, nome, status, rules, created_at, updated_at FROM campaigns WHERE id = :id`,
      { type: QueryTypes.SELECT, replacements: { id: req.params.id } },
    );
    if (!rows.length) return res.status(404).json({ code: 'CAMPAIGN_NOT_FOUND' });
    return res.json({ code: 'CAMPAIGN', data: await comExclusoes(rows[0]) });
  } catch (err) {
    console.error('[campaigns] get failed:', err.message);
    return res.status(500).json({ code: 'CAMPAIGNS_ERROR', message: err.message });
  }
};

export const createCampaign = async (req, res) => {
  const nome = String(req.body?.nome || '').trim();
  if (!nome) return res.status(400).json({ code: 'CAMPAIGN_NAME_REQUIRED' });
  try {
    const { regras, exclusoes } = separarExclusoes(req.body?.rules);
    const criada = await sequelize.transaction(async (transaction) => {
      const rows = await sequelize.query(
        `INSERT INTO campaigns (nome, status, rules, created_by)
              VALUES (:nome, 'rascunho', :rules::jsonb, :createdBy)
           RETURNING id, nome, status, rules, created_at, updated_at`,
        {
          type: QueryTypes.SELECT,
          replacements: {
            nome,
            rules: JSON.stringify(regras),
            createdBy: uuidOuNulo(req.headers['user-id']),
          },
          transaction,
        },
      );
      await gravarExclusoes(rows[0].id, exclusoes, transaction);
      return rows[0];
    });
    return res.status(201).json({ code: 'CAMPAIGN_CREATED', data: await comExclusoes(criada) });
  } catch (err) {
    console.error('[campaigns] create failed:', err.message);
    return res.status(500).json({ code: 'CAMPAIGNS_ERROR', message: err.message });
  }
};

export const updateCampaign = async (req, res) => {
  const { id } = req.params;
  try {
    const nome = req.body?.nome === undefined ? null : String(req.body.nome).trim();
    const mexeNasRegras = req.body?.rules !== undefined;
    const { regras, exclusoes } = mexeNasRegras
      ? separarExclusoes(req.body.rules)
      : { regras: null, exclusoes: [] };

    const atualizada = await sequelize.transaction(async (transaction) => {
      const rows = await sequelize.query(
        `UPDATE campaigns
            SET nome       = COALESCE(:nome, nome),
                rules      = COALESCE(:rules::jsonb, rules),
                updated_at = NOW()
          WHERE id = :id
          RETURNING id, nome, status, rules, created_at, updated_at`,
        {
          type: QueryTypes.SELECT,
          replacements: { id, nome, rules: regras ? JSON.stringify(regras) : null },
          transaction,
        },
      );
      if (!rows.length) return null;
      // Lista só é reescrita quando o caller mandou regras. Um PUT que só
      // renomeia a campanha não pode apagar as exclusões por omissão.
      if (mexeNasRegras) await gravarExclusoes(id, exclusoes, transaction);
      return rows[0];
    });

    if (!atualizada) return res.status(404).json({ code: 'CAMPAIGN_NOT_FOUND' });
    return res.json({ code: 'CAMPAIGN_UPDATED', data: await comExclusoes(atualizada) });
  } catch (err) {
    console.error('[campaigns] update failed:', err.message);
    return res.status(500).json({ code: 'CAMPAIGNS_ERROR', message: err.message });
  }
};

/**
 * Congela o público atual da campanha em `campaign_audience`.
 *
 * Apaga o snapshot anterior e grava o novo: um snapshot parcial, metade velho e
 * metade novo, seria pior que nenhum. A pergunta que ele responde é "quem estava
 * na lista neste instante", e ela não admite duas respostas.
 */
export const snapshotAudience = async (req, res) => {
  const { id } = req.params;
  try {
    const campanha = await sequelize.query(`SELECT id, rules FROM campaigns WHERE id = :id`, {
      type: QueryTypes.SELECT,
      replacements: { id },
    });
    if (!campanha.length) return res.status(404).json({ code: 'CAMPAIGN_NOT_FOUND' });

    // As regras do corpo ganham das gravadas, pra congelar exatamente o que o
    // operador está vendo na tela. Sem corpo, vale o que está salvo.
    const doBanco = { ...(campanha[0].rules || {}), exclusoes: await lerExclusoes(id) };
    const { regras, exclusoes } = separarExclusoes(req.body?.rules ?? doBanco);
    const resultado = await montarPublico({ ...regras, exclusoes });

    await sequelize.transaction(async (transaction) => {
      await sequelize.query(`DELETE FROM campaign_audience WHERE campaign_id = :id`, {
        type: QueryTypes.DELETE,
        replacements: { id },
        transaction,
      });
      // Um INSERT só, não um por tutor. São dezenas de linhas dentro de uma
      // transação: uma ida por tutor mantém a transação aberta o tempo todo sem
      // ganhar nada. O `jsonb_array_elements` desmonta a lista no banco.
      if (resultado.tutores.length) {
        await sequelize.query(
          `INSERT INTO campaign_audience (campaign_id, pet_owner_id, cell_phone, pets)
           SELECT :id, NULLIF(t->>'ownerId', '')::uuid, t->>'telefone', t->'pets'
             FROM jsonb_array_elements(:tutores::jsonb) AS t`,
          {
            type: QueryTypes.INSERT,
            replacements: { id, tutores: JSON.stringify(resultado.tutores) },
            transaction,
          },
        );
      }
      await sequelize.query(
        `UPDATE campaigns SET rules = :rules::jsonb, updated_at = NOW() WHERE id = :id`,
        {
          type: QueryTypes.UPDATE,
          replacements: { id, rules: JSON.stringify(regras) },
          transaction,
        },
      );
      await gravarExclusoes(id, exclusoes, transaction);
    });

    return res.json({
      code: 'CAMPAIGN_AUDIENCE_SNAPSHOT',
      data: { total: resultado.total, funil: resultado.funil },
    });
  } catch (err) {
    console.error('[campaigns] snapshot failed:', err.message);
    return res.status(500).json({ code: 'CAMPAIGNS_ERROR', message: err.message });
  }
};

/**
 * A conferencia PRE-VOO da producao: le o publico congelado e diz quais pecas
 * vao sair erradas, antes de gastar inferencia.
 *
 * Read-only e sem efeito: nao gera, nao grava, nao manda nada.
 */
export const productionPreflight = async (req, res) => {
  try {
    const dados = await conferenciaPreVoo(req.params.id);
    return res.json({ code: 'CAMPAIGN_PRODUCTION_PREFLIGHT', data: dados });
  } catch (err) {
    console.error('[campaigns] preflight failed:', err.message);
    return res.status(500).json({ code: 'PRODUCTION_ERROR', message: err.message });
  }
};

/** Lê a config da etapa de Produção. */
export const getProduction = async (req, res) => {
  try {
    const rows = await sequelize.query('SELECT producao FROM campaigns WHERE id = :id', {
      type: QueryTypes.SELECT,
      replacements: { id: req.params.id },
    });
    if (!rows.length) return res.status(404).json({ code: 'CAMPAIGN_NOT_FOUND' });
    return res.json({ code: 'CAMPAIGN_PRODUCTION', data: rows[0].producao || {} });
  } catch (err) {
    console.error('[campaigns] get production failed:', err.message);
    return res.status(500).json({ code: 'PRODUCTION_ERROR', message: err.message });
  }
};

/**
 * Salva a config da Produção.
 *
 * 🚨 Escreve na coluna `producao`, NUNCA no `rules`. O `rules` é do Público e é
 * reescrito inteiro toda vez que ele salva: config de Produção ali dentro seria
 * apagada em silêncio pela aba vizinha.
 */
export const saveProduction = async (req, res) => {
  try {
    const rows = await sequelize.query(
      `UPDATE campaigns SET producao = :producao::jsonb, updated_at = NOW()
        WHERE id = :id RETURNING producao`,
      {
        type: QueryTypes.SELECT,
        replacements: { id: req.params.id, producao: JSON.stringify(req.body?.producao ?? {}) },
      },
    );
    if (!rows.length) return res.status(404).json({ code: 'CAMPAIGN_NOT_FOUND' });
    return res.json({ code: 'CAMPAIGN_PRODUCTION_SAVED', data: rows[0].producao });
  } catch (err) {
    console.error('[campaigns] save production failed:', err.message);
    return res.status(500).json({ code: 'PRODUCTION_ERROR', message: err.message });
  }
};

/** Sobe o fundo da peça pro lugar de onde o gerador lê cena de referência. */
export const uploadBackground = async (req, res) => {
  try {
    const { nomeArquivo, base64, contentType } = req.body || {};
    if (!base64) return res.status(400).json({ code: 'BACKGROUND_REQUIRED' });
    const fundo = await subirFundo({ nomeArquivo, base64, contentType });
    return res.json({ code: 'CAMPAIGN_BACKGROUND', data: fundo });
  } catch (err) {
    console.error('[campaigns] background failed:', err.message);
    return res.status(500).json({ code: 'BACKGROUND_ERROR', message: err.message });
  }
};

/**
 * Gera UMA peça, pra aprovar a direção de arte antes de replicar.
 *
 * Errar a direção numa amostra custa uma inferência. Errar no lote custa 69 e um
 * disparo — por isso este endpoint existe separado, e por isso ele gera um só.
 */
export const generateSample = async (req, res) => {
  const { id } = req.params;
  try {
    const rows = await sequelize.query('SELECT producao FROM campaigns WHERE id = :id', {
      type: QueryTypes.SELECT,
      replacements: { id },
    });
    if (!rows.length) return res.status(404).json({ code: 'CAMPAIGN_NOT_FOUND' });

    const producao = { ...(rows[0].producao || {}), ...(req.body?.producao || {}) };
    const alvo = req.body?.alvo || (await escolherAlvo(id));
    if (!alvo) {
      return res.status(400).json({
        code: 'SEM_PUBLICO',
        message: 'Não há público congelado: a amostra precisa de um tutor real pra usar de modelo.',
      });
    }

    // O carimbo entra no nome do arquivo: duas amostras seguidas do mesmo alvo
    // não podem se sobrescrever, senão comparar a anterior com a nova é
    // impossível — e comparar é o trabalho desta etapa.
    const amostra = await gerarAmostra({
      campaignId: id,
      producao,
      alvo,
      carimbo: Date.now(),
    });

    const historico = [
      ...(Array.isArray(rows[0].producao?.amostras) ? rows[0].producao.amostras : []),
      {
        url: amostra.url,
        alvo: amostra.alvo,
        modelo: amostra.modelo,
        em: new Date().toISOString(),
      },
    ].slice(-12);

    await sequelize.query(
      `UPDATE campaigns
          SET producao = :producao::jsonb, updated_at = NOW()
        WHERE id = :id`,
      {
        type: QueryTypes.UPDATE,
        replacements: { id, producao: JSON.stringify({ ...producao, amostras: historico }) },
      },
    );

    // 🚨 Se o alvo nao tinha foto legivel, a peca pode ter um pet INVENTADO.
    // Vai junto na resposta pra tela dizer isso: aprovar direcao numa amostra
    // de pet fabricado e aprovar no escuro.
    return res.json({
      code: 'CAMPAIGN_SAMPLE',
      data: { ...amostra, amostras: historico, alvoLimpo: alvo.limpo !== false },
    });
  } catch (err) {
    console.error('[campaigns] sample failed:', err.message);
    return res.status(500).json({ code: 'SAMPLE_ERROR', message: err.message });
  }
};

/**
 * Aprova a direção de arte: qual amostra vale, e a receita que a produziu.
 *
 * 🚨 É a peça que faltava pra replicação existir. Sem ela o lote não tem o que
 * replicar: ou copiaria os campos vivos do formulário — e aí uma edição feita
 * depois da aprovação entraria no lote sem ninguém aprovar — ou pediria de novo
 * ao operador o que ele já decidiu olhando a amostra.
 */
export const approveDirection = async (req, res) => {
  try {
    const salvo = await aprovarDirecao({
      campaignId: req.params.id,
      url: req.body?.url,
      alvo: req.body?.alvo,
    });
    if (!salvo) return res.status(404).json({ code: 'CAMPAIGN_NOT_FOUND' });
    if (salvo.erro) {
      return res.status(400).json({
        code: salvo.erro,
        message: 'Essa amostra não está no histórico desta campanha.',
      });
    }
    return res.json({ code: 'CAMPAIGN_DIRECTION_APPROVED', data: salvo });
  } catch (err) {
    console.error('[campaigns] approve direction failed:', err.message);
    return res.status(500).json({ code: 'PRODUCTION_ERROR', message: err.message });
  }
};

/**
 * Dispara o lote e VOLTA na hora.
 *
 * 🚨 Não espera as ~69 peças. Oito minutos não cabem num request, e uma conexão
 * derrubada no meio mataria o lote sem deixar registro de quais peças saíram. O
 * estado mora na tabela; a tela pergunta pelo GET.
 */
export const startBatch = async (req, res) => {
  try {
    const r = await iniciarLote(req.params.id, { alvo: req.body?.alvo });
    if (r.erro === 'CAMPAIGN_NOT_FOUND') return res.status(404).json({ code: r.erro });
    if (r.erro) return res.status(400).json({ code: r.erro, message: r.mensagem });
    return res.json({ code: 'CAMPAIGN_BATCH_STARTED', data: r });
  } catch (err) {
    console.error('[campaigns] batch failed:', err.message);
    return res.status(500).json({ code: 'BATCH_ERROR', message: err.message });
  }
};

/** O progresso do lote, peça por peça. É o que a tela pergunta enquanto roda. */
export const listPieces = async (req, res) => {
  try {
    return res.json({ code: 'CAMPAIGN_PIECES', data: await estadoDoLote(req.params.id) });
  } catch (err) {
    console.error('[campaigns] list pieces failed:', err.message);
    return res.status(500).json({ code: 'BATCH_ERROR', message: err.message });
  }
};

/**
 * O veredito humano sobre uma peça.
 *
 * 🚨 Esta é a única checagem que pega os dois piores defeitos de 26/08: o
 * cachorro ser o do tutor certo, e a palavra na parede estar escrita certo. Os
 * dois passaram por dimensão, peso e detecção de pet na cena.
 */
export const reviewPiece = async (req, res) => {
  try {
    const r = await revisarPeca({
      campaignId: req.params.id,
      pieceId: req.params.pieceId,
      revisao: req.body?.revisao ?? null,
      motivo: req.body?.motivo,
    });
    if (r.erro === 'PECA_NAO_ENCONTRADA') return res.status(404).json({ code: r.erro });
    if (r.erro) return res.status(400).json({ code: r.erro });
    return res.json({ code: 'CAMPAIGN_PIECE_REVIEWED', data: r });
  } catch (err) {
    console.error('[campaigns] review failed:', err.message);
    return res.status(500).json({ code: 'BATCH_ERROR', message: err.message });
  }
};

/**
 * Só os templates APROVADOS, com o corpo e as variáveis que ele usa.
 *
 * 🚨 Reaproveita o catálogo da mensageria (`template-catalog.service`) em vez de
 * consultar `templates` de novo. Duas leituras do mesmo dado divergem: aquela
 * camada já resolve o `components_json` que ora é jsonb e ora é texto, e uma
 * cópia aqui herdaria metade do catálogo sem corpo.
 */
export const listTemplates = async (_req, res) => {
  try {
    const catalogo = await getTemplateCatalog();
    const lista = Object.entries(catalogo)
      .map(([nome, t]) => ({
        nome,
        rotulo: t.label || nome,
        categoria: t.category,
        corpo: t.body || '',
        headerFormato: t.header_format || null,
        rodape: t.footer || null,
        botoes: t.buttons || [],
        posicoes: variaveisDoCorpo(t.body),
      }))
      .sort((a, b) => a.nome.localeCompare(b.nome));
    return res.json({ code: 'CAMPAIGN_TEMPLATES', data: lista });
  } catch (err) {
    console.error('[campaigns] templates failed:', err.message);
    return res.status(500).json({ code: 'TEMPLATE_ERROR', message: err.message });
  }
};

/** Lê a config da etapa de Template. */
export const getTemplate = async (req, res) => {
  try {
    const rows = await sequelize.query('SELECT template FROM campaigns WHERE id = :id', {
      type: QueryTypes.SELECT,
      replacements: { id: req.params.id },
    });
    if (!rows.length) return res.status(404).json({ code: 'CAMPAIGN_NOT_FOUND' });
    return res.json({ code: 'CAMPAIGN_TEMPLATE', data: rows[0].template || {} });
  } catch (err) {
    console.error('[campaigns] get template failed:', err.message);
    return res.status(500).json({ code: 'TEMPLATE_ERROR', message: err.message });
  }
};

/**
 * Salva a config da etapa de Template.
 *
 * 🚨 Coluna `template`, NUNCA `rules` nem `producao`. Cada etapa salva a si
 * mesma inteira, e uma etapa que grava por cima da vizinha apaga o trabalho dela
 * em silêncio.
 */
export const saveTemplate = async (req, res) => {
  try {
    const rows = await sequelize.query(
      `UPDATE campaigns SET template = :template::jsonb, updated_at = NOW()
        WHERE id = :id RETURNING template`,
      {
        type: QueryTypes.SELECT,
        replacements: { id: req.params.id, template: JSON.stringify(req.body?.template ?? {}) },
      },
    );
    if (!rows.length) return res.status(404).json({ code: 'CAMPAIGN_NOT_FOUND' });
    return res.json({ code: 'CAMPAIGN_TEMPLATE_SAVED', data: rows[0].template });
  } catch (err) {
    console.error('[campaigns] save template failed:', err.message);
    return res.status(500).json({ code: 'TEMPLATE_ERROR', message: err.message });
  }
};

/**
 * A prévia do que cada casa vai LER.
 *
 * Read-only e sem efeito: não manda nada. Existe porque variável errada só
 * aparece depois do disparo, e porque o gênero de cada casa sai do cadastro do
 * pet — quem não tem gênero cadastrado fica bloqueado aqui em vez de receber uma
 * mensagem que chama o cachorro dele pelo pronome errado.
 */
export const previewTemplate = async (req, res) => {
  try {
    const dados = await resolverTemplate(req.params.id, {
      corpo: req.body?.corpo,
      variaveis: req.body?.variaveis,
    });
    return res.json({ code: 'CAMPAIGN_TEMPLATE_PREVIEW', data: dados });
  } catch (err) {
    console.error('[campaigns] template preview failed:', err.message);
    return res.status(500).json({ code: 'TEMPLATE_ERROR', message: err.message });
  }
};

export default {
  previewAudience,
  listCampaigns,
  getCampaign,
  createCampaign,
  updateCampaign,
  snapshotAudience,
  productionPreflight,
  getProduction,
  saveProduction,
  uploadBackground,
  generateSample,
  approveDirection,
  startBatch,
  listPieces,
  reviewPiece,
  listTemplates,
  getTemplate,
  saveTemplate,
  previewTemplate,
};
