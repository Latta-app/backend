// AI Feedback service — substitui webhook N8n /thumbs (Fase 4).
//
// O painel mostra sugestões IA (offer/scheduling) com botões 👍/👎.
// Operador clica e dispara feedback via este endpoint, que faz UPDATE
// na ai_agent_output.thumbs do registro mais recente daquele cellphone.
//
// Não há model Sequelize pra ai_agent_output — a tabela é gerenciada
// pelo workflow N8n IA. Usamos query SQL direto via sequelize.query.

import { sequelize } from '../../config/database.js';

const setThumbs = async ({ cell_phone, thumbs }) => {
  if (!cell_phone) throw new Error('cell_phone is required');
  if (thumbs !== 'up' && thumbs !== 'down') {
    throw new Error('thumbs must be up or down');
  }

  // UPDATE no registro MAIS RECENTE daquele cellphone (ORDER BY id DESC LIMIT 1
  // via subquery — Postgres permite UPDATE com WHERE id IN (subselect)).
  const [_, meta] = await sequelize.query(
    `UPDATE ai_agent_output
     SET thumbs = :thumbs
     WHERE id = (
       SELECT id FROM ai_agent_output
       WHERE cellphone = :cell_phone
       ORDER BY created_at DESC
       LIMIT 1
     )
     RETURNING id, cellphone, thumbs`,
    {
      replacements: { thumbs, cell_phone },
    },
  );

  return {
    success: true,
    rows_updated: meta?.rowCount ?? 0,
  };
};

export default {
  setThumbs,
};
