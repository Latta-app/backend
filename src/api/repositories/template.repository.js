import { Op, Sequelize } from 'sequelize';
import { Template, TemplateVariable, TemplateVariableType } from '../models/index.js';

const getAllTemplates = async ({ page = 1, limit = 15 }) => {
  try {
    // const offset = (page - 1) * limit;

    const { count: totalItems, rows: templates } = await Template.findAndCountAll({
      where: {
        // Esconde templates ARCHIVED (Petland-herdados desativados em 2026-05),
        // PENDING (em revisão Meta — não pode enviar) e REJECTED.
        template_status: 'APPROVED',
        // Esconde templates sem label legível ("Template sem nome" no painel).
        // template_label é populado automaticamente pelo manage-templates.ts
        // cmdCreate desde a Fase de melhorias 2026-05; templates antigos sem
        // label só serão visíveis quando alguém preencher manualmente via SQL.
        template_label: { [Op.not]: null },
      },
      attributes: [
        'id',
        'template_id',
        'template_name',
        'template_label',
        'template_language',
        'template_status',
        'template_preview',
        'template_category',
        'manual_var_positions',
      ],
      include: [
        {
          model: TemplateVariable,
          as: 'variables',
          attributes: [
            'id',
            'template_id',
            'template_component_id',
            'template_component_type_id',
            'template_varible_type_id', // Note: corrigir typo se possível
            'variable_position',
          ],
          include: [
            {
              model: TemplateVariableType,
              as: 'templateVariableType',
              attributes: ['id', 'type', 'description', 'n8n_formula'],
            },
          ],
        },
      ],
      // limit,
      // offset,
      order: [
        // Suporte sobre Assunto (Luma) sempre primeiro — é o template mais
        // usado pra abrir atendimento humano contextual com qualquer assunto
        // (input livre). Demais templates seguem ordem alfabética por label.
        [
          Sequelize.literal(`CASE WHEN "Template"."template_name" = 'luma_suporte_assunto_pontual_v1' THEN 0 ELSE 1 END`),
          'ASC',
        ],
        ['template_label', 'ASC'],
        // Ordenar as variáveis por posição também
        [{ model: TemplateVariable, as: 'variables' }, 'variable_position', 'ASC'],
      ],
    });

    return {
      templates,
      totalItems,
    };
  } catch (error) {
    throw new Error(`Repository error: ${error.message}`);
  }
};

const getTemplateById = async ({ id }) => {
  try {
    const template = await Template.findOne({
      where: {
        id,
      },
      order: [['template_label', 'ASC']],
      attributes: [
        'id',
        'template_id',
        'template_name',
        'template_label',
        'template_language',
        'template_status',
        'template_preview',
        'template_category',
        'manual_var_positions',
      ],
    });

    return template;
  } catch (error) {
    throw new Error(`Repository error: ${error.message}`);
  }
};

const searchTemplates = async ({ name, page = 1, limit = 15 }) => {
  try {
    const { Op } = require('sequelize');
    // const offset = (page - 1) * limit;

    const whereConditions = {};

    if (name) {
      whereConditions.template_name = { [Op.iLike]: `%${name}%` };
    }

    const { count: totalItems, rows: templates } = await Template.findAndCountAll({
      where: whereConditions,
      attributes: [
        'id',
        'template_id',
        'template_name',
        'template_label',
        'template_language',
        'template_status',
        'template_preview',
        'template_category',
        'manual_var_positions',
      ],
      // limit,
      // offset,
      order: [['template_label', 'ASC']],
    });

    return {
      templates,
      totalItems,
    };
  } catch (error) {
    throw new Error(`Repository error: ${error.message}`);
  }
};

export default {
  getAllTemplates,
  getTemplateById,
  searchTemplates,
};
