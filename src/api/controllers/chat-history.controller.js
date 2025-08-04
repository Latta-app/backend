import ChatService from '../services/chat-history.service.js';

const getAllContactsWithMessages = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const { id, role, clinic_id } = req.user;

    const responsibility = req.query.responsibility === 'true';
    const unread = req.query.unread === 'true';
    const tags = req?.query?.tags ? req.query.tags.split(',').filter((tag) => tag.trim()) : [];

    const filters = {
      responsibility,
      unread,
      tags,
    };

    const result = await ChatService.getAllContactsWithMessages({
      user_id: id,
      clinic_id,
      role: role.role,
      page,
      limit,
      filters,
    });

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
    const { id, clinic_id, role } = req.user;

    const responsibility = req.query.responsibility === 'true';
    const unread = req.query.unread === 'true';
    const tags = req.query.tags ? req.query.tags.split(',').filter((tag) => tag.trim()) : [];

    const filters = {
      responsibility,
      unread,
      tags,
    };

    const contacts = await ChatService.searchContacts({
      clinic_id,
      query,
      page: parseInt(page),
      limit: parseInt(limit),
      role: role.role,
      user_id: id,
      filters, // Novo parâmetro
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
