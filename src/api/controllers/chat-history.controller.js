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

const getContactByPetOwnerId = async (req, res) => {
  try {
    const { pet_owner_id } = req.params;
    const { role } = req.user;
    const { page = 1, limit = 20 } = req.query;

    // Validação dos parâmetros
    if (!pet_owner_id) {
      return res.status(400).json({
        code: 'MISSING_PET_OWNER_ID',
        message: 'pet_owner_id is required',
      });
    }

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);

    if (pageNum < 1 || limitNum < 1 || limitNum > 100) {
      return res.status(400).json({
        code: 'INVALID_PAGINATION_PARAMS',
        message: 'Invalid pagination parameters',
      });
    }

    console.log('🔍 Controller - Buscando contato para pet_owner_id:', pet_owner_id);

    const result = await ChatService.getContactByPetOwnerId({
      pet_owner_id,
      role: role.role,
      page: pageNum,
      limit: limitNum,
    });

    if (!result || !result.contact) {
      return res.status(404).json({
        code: 'CONTACT_NOT_FOUND',
        message: 'No contact found for this pet owner',
      });
    }

    return res.status(200).json({
      code: 'CONTACT_RETRIEVED',
      data: result.contact,
      pagination: result.pagination,
    });
  } catch (error) {
    console.error('Error retrieving contact by pet owner id:', error);
    return res.status(500).json({
      code: 'CONTACT_RETRIEVAL_ERROR',
      message: error.message,
    });
  }
};

const getAllContactsMessagesWithNoFilters = async (req, res) => {
  try {
    const { role } = req.user;
    const { page = 1, limit = 15 } = req.query; // Mudei de 20 para 15 para manter padrão

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);

    if (pageNum < 1 || limitNum < 1 || limitNum > 100) {
      return res.status(400).json({
        code: 'INVALID_PAGINATION_PARAMS',
        message: 'Invalid pagination parameters',
      });
    }

    console.log('🔍 Controller - Buscando TODOS os contatos sem filtros');

    const result = await ChatService.getAllContactsMessagesWithNoFilters({
      role: role.role,
      page: pageNum,
      limit: limitNum,
    });

    // Corrigir estrutura da resposta - deve retornar contacts, não contact
    if (!result || !result.contacts) {
      return res.status(404).json({
        code: 'CONTACTS_NOT_FOUND',
        message: 'No contacts found',
      });
    }

    return res.status(200).json({
      code: 'CONTACTS_RETRIEVED',
      data: result.contacts,
      totalItems: result.totalItems,
    });
  } catch (error) {
    console.error('Error retrieving all contacts without filters:', error);
    return res.status(500).json({
      code: 'CONTACTS_RETRIEVAL_ERROR',
      message: error.message,
    });
  }
};

const getContactByPetOwnerIdOrPhone = async (req, res) => {
  try {
    const { pet_owner_id, contact } = req.query;
    const { role } = req.user;
    const { page = 1, limit = 20 } = req.query;

    if (!pet_owner_id && !contact) {
      return res.status(400).json({
        code: 'MISSING_PARAMS',
        message: 'pet_owner_id or contact is required',
      });
    }

    if (pet_owner_id && contact) {
      return res.status(400).json({
        code: 'INVALID_PARAMS',
        message: 'Cannot provide both pet_owner_id and contact',
      });
    }

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);

    if (pageNum < 1 || limitNum < 1 || limitNum > 100) {
      return res.status(400).json({
        code: 'INVALID_PAGINATION_PARAMS',
        message: 'Invalid pagination parameters',
      });
    }

    console.log('🔍 Controller - Buscando contato:', { pet_owner_id, contact });

    const result = await ChatService.getContactByPetOwnerIdOrPhone({
      pet_owner_id,
      contact,
      role: role.role,
      page: pageNum,
      limit: limitNum,
    });

    if (!result || !result.contact) {
      return res.status(404).json({
        code: 'CONTACT_NOT_FOUND',
        message: 'No contact found',
      });
    }

    return res.status(200).json({
      code: 'CONTACT_RETRIEVED',
      data: result.contact,
      pagination: result.pagination,
    });
  } catch (error) {
    console.error('Error retrieving contact:', error);
    return res.status(500).json({
      code: 'CONTACT_RETRIEVAL_ERROR',
      message: error.message,
    });
  }
};

export default {
  getAllContactsWithMessages,
  searchContacts,
  getAllContactsMessagesWithNoFilters,
  getContactByPetOwnerId,
  getContactByPetOwnerIdOrPhone,
};
