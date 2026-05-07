import MessagingService from '../services/messaging.service.js';

const sendText = async (req, res) => {
  try {
    const { contact_id, message } = req.body;
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
    });

    return res.status(200).json({
      code: 'MESSAGE_SENT',
      data: result,
    });
  } catch (error) {
    console.error('Error sending text:', error);
    return res.status(500).json({
      code: 'MESSAGE_SEND_ERROR',
      message: error.message,
    });
  }
};

const sendTemplate = async (req, res) => {
  try {
    const { contact_id, template_id, manual_vars } = req.body;
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
    });

    return res.status(200).json({
      code: 'TEMPLATE_SENT',
      data: result,
    });
  } catch (error) {
    console.error('Error sending template:', error);
    return res.status(500).json({
      code: 'TEMPLATE_SEND_ERROR',
      message: error.message,
    });
  }
};

const sendAISuggestion = async (req, res) => {
  try {
    const { contact_id, message, is_modificated } = req.body;
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
    });
    return res.status(200).json({
      code: 'AI_SUGGESTION_SENT',
      data: result,
    });
  } catch (error) {
    console.error('Error sending AI suggestion:', error);
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
