import ChatService from '../services/chat-history.service.js';

const getAllMessages = async (_req, res) => {
  try {
    const messages = await ChatService.getAllMessages();

    return res.status(200).json({
      code: 'MESSAGES_RETRIEVED',
      data: messages,
    });
  } catch (error) {
    console.error('Error retrieving messages:', error);
    return res.status(500).json({
      code: 'MESSAGES_RETRIEVAL_ERROR',
      message: error.message,
    });
  }
};

const getMessagesByPhone = async (req, res) => {
  try {
    const { phone } = req.params;
    const messages = await ChatService.getMessagesByPhone({ phone });

    return res.status(200).json({
      code: 'MESSAGES_BY_PHONE_RETRIEVED',
      data: messages,
    });
  } catch (error) {
    console.error('Error retrieving messages by phone:', error);
    return res.status(500).json({
      code: 'MESSAGES_BY_PHONE_RETRIEVAL_ERROR',
      message: error.message,
    });
  }
};

export default {
  getAllMessages,
  getMessagesByPhone,
};
