import ChatService from '../services/chat-history.service.js';

const getAllContactsWithMessages = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;

    const result = await ChatService.getAllContactsWithMessages(page, limit);

    return res.status(200).json({
      code: 'CONTACTS_RETRIEVED',
      data: result.contacts,
    });
  } catch (error) {
    console.error('Error retrieving contacts and messages:', error);
    return res.status(500).json({
      code: 'CONTACTS_RETRIEVAL_ERROR',
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
  getAllContactsWithMessages,
  getMessagesByPhone,
};
