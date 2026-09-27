import MessagingService from '../services/messaging.service.js';

const sendText = async (req, res) => {
  try {
    const { contact_id, message, business_phone_number_id } = req.body;
    const userId = req.user?.id || null;

    if (!contact_id) {
      return res.status(400).json({
        code: 'MISSING_CONTACT_ID',
        message: 'contact_id is required',
      });
    }
    if (!message || typeof message !== 'string' || !message.trim()) {
      return res.status(400).json({
        code: 'MISSING_MESSAGE',
        message: 'message is required',
      });
    }

    const result = await MessagingService.sendText({
      contact_id,
      message: message.trim(),
      user_id: userId,
      business_phone_number_id: business_phone_number_id ?? null,
    });

    return res.status(200).json({
      code: 'MESSAGE_SENT',
      data: result,
    });
  } catch (error) {
    console.error('Error sending text:', error);
    if (error?.status === 400) {
      return res.status(400).json({ code: error.code, message: error.message });
    }
    return res.status(500).json({
      code: 'MESSAGE_SEND_ERROR',
      message: error.message,
    });
  }
};

const sendTemplate = async (req, res) => {
  try {
    const { contact_id, template_id, manual_vars, business_phone_number_id } = req.body;
    const userId = req.user?.id || null;

    if (!contact_id) {
      return res.status(400).json({
        code: 'MISSING_CONTACT_ID',
        message: 'contact_id is required',
      });
    }
    if (!template_id) {
      return res.status(400).json({
        code: 'MISSING_TEMPLATE_ID',
        message: 'template_id is required',
      });
    }

    const result = await MessagingService.sendTemplate({
      contact_id,
      template_id,
      manual_vars: manual_vars || undefined,
      user_id: userId,
      business_phone_number_id: business_phone_number_id ?? null,
    });

    return res.status(200).json({
      code: 'TEMPLATE_SENT',
      data: result,
    });
  } catch (error) {
    console.error('Error sending template:', error);
    if (error?.status === 400) {
      return res.status(400).json({ code: error.code, message: error.message });
    }
    return res.status(500).json({
      code: 'TEMPLATE_SEND_ERROR',
      message: error.message,
    });
  }
};

const sendAISuggestion = async (req, res) => {
  try {
    const { contact_id, message, is_modificated, business_phone_number_id } = req.body;
    const userId = req.user?.id || null;
    if (!contact_id) {
      return res.status(400).json({
        code: 'MISSING_CONTACT_ID',
        message: 'contact_id is required',
      });
    }
    if (!message || typeof message !== 'string' || !message.trim()) {
      return res.status(400).json({
        code: 'MISSING_MESSAGE',
        message: 'message is required',
      });
    }
    const result = await MessagingService.sendAISuggestion({
      contact_id,
      message: message.trim(),
      is_modificated: !!is_modificated,
      user_id: userId,
      business_phone_number_id: business_phone_number_id ?? null,
    });
    return res.status(200).json({
      code: 'AI_SUGGESTION_SENT',
      data: result,
    });
  } catch (error) {
    console.error('Error sending AI suggestion:', error);
    if (error?.status === 400) {
      return res.status(400).json({ code: error.code, message: error.message });
    }
    return res.status(500).json({
      code: 'AI_SUGGESTION_SEND_ERROR',
      message: error.message,
    });
  }
};

export default {
  sendText,
  sendTemplate,
  sendAISuggestion,
};
