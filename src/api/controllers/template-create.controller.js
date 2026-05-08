import TemplateCreateService from '../services/template-create.service.js';

const draft = async (req, res) => {
  try {
    const { description } = req.body;
    if (!description || !description.trim()) {
      return res.status(400).json({
        code: 'MISSING_DESCRIPTION',
        message: 'description is required',
      });
    }
    const result = await TemplateCreateService.draftFromDescription({ description });
    return res.status(200).json({
      code: 'TEMPLATE_DRAFTED',
      data: result,
    });
  } catch (error) {
    // IMPORTANT: log SO a mensagem (nao o objeto inteiro) — axios errors
    // incluem config.headers com Bearer tokens. Vazou uma vez nos logs PM2,
    // nao deve repetir.
    console.error('[template-create] draft falhou:', error.message);
    return res.status(500).json({
      code: 'TEMPLATE_DRAFT_ERROR',
      message: error.message,
    });
  }
};

const submit = async (req, res) => {
  try {
    const { name, label, body, category, language, manual_var_positions, buttons } = req.body;
    if (!name || !label || !body) {
      return res.status(400).json({
        code: 'MISSING_FIELDS',
        message: 'name, label and body are required',
      });
    }
    const result = await TemplateCreateService.submitToMeta({
      name,
      label,
      body,
      category,
      language,
      manual_var_positions: Array.isArray(manual_var_positions) ? manual_var_positions : [],
      buttons: Array.isArray(buttons) ? buttons : [],
    });
    return res.status(200).json({
      code: 'TEMPLATE_SUBMITTED',
      data: result,
    });
  } catch (error) {
    console.error('[template-create] submit falhou:', error.message);
    return res.status(500).json({
      code: 'TEMPLATE_SUBMIT_ERROR',
      message: error.message,
    });
  }
};

export default { draft, submit };
