/* ============================================================================
 * CAMPANHAS — cockpit
 * ============================================================================
 *
 * Duas famílias de endpoint, e a diferença entre elas importa:
 *
 * 1. `preview` NÃO toca em tabela nenhuma. É só o funil de elegibilidade rodado
 *    ao vivo contra o banco. Uma campanha inteira pode ser montada e conferida
 *    sem nunca ser salva — e é o que a primeira fatia da aba de Público faz.
 *
 * 2. O resto persiste em `campaigns` / `campaign_audience`. `campaigns` guarda o
 *    conjunto de regras em jsonb (formato aberto de propósito: as outras cinco
 *    abas ainda não existem pra dizer o que precisam guardar).
 *    `campaign_audience` é o snapshot CONGELADO do público.
 *
 * 🚨 Por que o snapshot existe: o público é uma consulta viva e a base muda
 * embaixo dele. O funil do Dia do Cachorro deu 67 em 26/08 e dá outro número
 * hoje, com as mesmas regras, porque tutor novo entrou. Sem congelar, não há
 * como responder "quem exatamente recebeu aquela peça" depois do disparo.
 * ============================================================================ */

import { sequelize } from '../../config/database.js';
import { QueryTypes } from 'sequelize';
import { montarPublico, normalizarRegras } from '../services/campaign-audience.service.js';

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
              (SELECT COUNT(*) FROM campaign_audience ca WHERE ca.campaign_id = c.id) AS audiencia_congelada
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
    return res.json({ code: 'CAMPAIGN', data: rows[0] });
  } catch (err) {
    console.error('[campaigns] get failed:', err.message);
    return res.status(500).json({ code: 'CAMPAIGNS_ERROR', message: err.message });
  }
};

export const createCampaign = async (req, res) => {
  const nome = String(req.body?.nome || '').trim();
  if (!nome) return res.status(400).json({ code: 'CAMPAIGN_NAME_REQUIRED' });
  try {
    const rules = normalizarRegras(req.body?.rules);
    const rows = await sequelize.query(
      `INSERT INTO campaigns (nome, status, rules, created_by)
            VALUES (:nome, 'rascunho', :rules::jsonb, :createdBy)
         RETURNING id, nome, status, rules, created_at, updated_at`,
      {
        type: QueryTypes.SELECT,
        replacements: {
          nome,
          rules: JSON.stringify(rules),
          createdBy: req.headers['user-id'] || null,
        },
      },
    );
    return res.status(201).json({ code: 'CAMPAIGN_CREATED', data: rows[0] });
  } catch (err) {
    console.error('[campaigns] create failed:', err.message);
    return res.status(500).json({ code: 'CAMPAIGNS_ERROR', message: err.message });
  }
};

export const updateCampaign = async (req, res) => {
  try {
    const nome = req.body?.nome === undefined ? null : String(req.body.nome).trim();
    const rules = req.body?.rules === undefined ? null : JSON.stringify(normalizarRegras(req.body.rules));
    const rows = await sequelize.query(
      `UPDATE campaigns
          SET nome       = COALESCE(:nome, nome),
              rules      = COALESCE(:rules::jsonb, rules),
              updated_at = NOW()
        WHERE id = :id
        RETURNING id, nome, status, rules, created_at, updated_at`,
      { type: QueryTypes.SELECT, replacements: { id: req.params.id, nome, rules } },
    );
    if (!rows.length) return res.status(404).json({ code: 'CAMPAIGN_NOT_FOUND' });
    return res.json({ code: 'CAMPAIGN_UPDATED', data: rows[0] });
  } catch (err) {
    console.error('[campaigns] update failed:', err.message);
    return res.status(500).json({ code: 'CAMPAIGNS_ERROR', message: err.message });
  }
};

/**
 * Congela o público atual da campanha em `campaign_audience`.
 *
 * Apaga o snapshot anterior e grava o novo: um snapshot parcial, metade velho e
 * metade novo, seria pior que nenhum — a pergunta que ele responde é "quem
 * estava na lista neste instante", e ela não admite duas respostas.
 */
export const snapshotAudience = async (req, res) => {
  const { id } = req.params;
  try {
    const campanha = await sequelize.query(`SELECT id, rules FROM campaigns WHERE id = :id`, {
      type: QueryTypes.SELECT,
      replacements: { id },
    });
    if (!campanha.length) return res.status(404).json({ code: 'CAMPAIGN_NOT_FOUND' });

    const resultado = await montarPublico(req.body?.rules ?? campanha[0].rules);

    await sequelize.transaction(async (transaction) => {
      await sequelize.query(`DELETE FROM campaign_audience WHERE campaign_id = :id`, {
        type: QueryTypes.DELETE,
        replacements: { id },
        transaction,
      });
      for (const tutor of resultado.tutores) {
        await sequelize.query(
          `INSERT INTO campaign_audience (campaign_id, pet_owner_id, cell_phone, pets)
                VALUES (:id, :ownerId, :telefone, :pets::jsonb)`,
          {
            type: QueryTypes.INSERT,
            replacements: {
              id,
              ownerId: tutor.ownerId,
              telefone: tutor.telefone,
              pets: JSON.stringify(tutor.pets),
            },
            transaction,
          },
        );
      }
      await sequelize.query(
        `UPDATE campaigns SET rules = :rules::jsonb, updated_at = NOW() WHERE id = :id`,
        {
          type: QueryTypes.UPDATE,
          replacements: { id, rules: JSON.stringify(resultado.regras) },
          transaction,
        },
      );
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

export default {
  previewAudience,
  listCampaigns,
  getCampaign,
  createCampaign,
  updateCampaign,
  snapshotAudience,
};
