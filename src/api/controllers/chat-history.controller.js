import ChatService from '../services/chat-history.service.js';

const getAllContactsWithMessages = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const clinic_id = req.user.clinic_id;

    const result = await ChatService.getAllContactsWithMessages({ clinic_id, page, limit });

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

const searchContacts = async (req, res) => {
  try {
    const { query, page = 1, limit = 15 } = req.query;
    const clinic_id = req.user.clinic_id;

    const contacts = await ChatService.searchContacts({
      clinic_id,
      query,
      page: parseInt(page),
      limit: parseInt(limit),
    });

    return res.status(200).json({
      code: 'CONTACTS_SEARCH_SUCCESS',
      data: contacts,
    });
  } catch (error) {
    console.error('Error searching contacts:', error);
    return res.status(500).json({
      code: 'CONTACTS_SEARCH_ERROR',
      message: error.message,
    });
  }
};

export default {
  getAllContactsWithMessages,
  searchContacts,
};
