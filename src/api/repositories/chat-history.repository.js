import {
  ChatHistory,
  Contact,
  Pet,
  PetBreed,
  PetFurLength,
  PetGender,
  PetOwner,
  PetSize,
  PetType,
} from '../models/index.js';

const getAllContactsWithMessages = async (page = 1, limit = 10) => {
  try {
    const offset = (page - 1) * limit;

    const { count: totalItems, rows: contacts } = await Contact.findAndCountAll({
      // limit,
      // offset,
      order: [['updated_at', 'DESC']],
      include: [
        {
          model: ChatHistory,
          as: 'chatHistory',
          attributes: [
            'id',
            'message',
            'sent_by',
            'sent_to',
            'role',
            'timestamp',
            'window_timestamp',
            'journey',
            'message_type',
            'date',
            'message_id',
            'midia_url',
            'midia_name',
          ],
        },
        {
          model: PetOwner,
          as: 'petOwner',
          attributes: [
            'id',
            'name',
            'email',
            'cell_phone',
            'cpf',
            'date_of_birth',
            'is_active',
            'created_at',
          ],
          include: [
            {
              model: Pet,
              as: 'pets',
              attributes: ['id', 'name', 'date_of_birthday', 'photo'],
              through: { attributes: [] },
              include: [
                { model: PetType, as: 'type', attributes: ['id', 'name', 'label'] },
                { model: PetBreed, as: 'breed', attributes: ['id', 'name', 'label'] },
                { model: PetGender, as: 'gender', attributes: ['id', 'name', 'label'] },
                { model: PetSize, as: 'size', attributes: ['id', 'name', 'label'] },
                { model: PetFurLength, as: 'furLength', attributes: ['id', 'name', 'label'] },
              ],
            },
          ],
        },
      ],
    });
    console.log('contacts:', contacts);
    return {
      contacts,
      totalItems,
    };
  } catch (error) {
    throw new Error(`Repository error: ${error.message}`);
  }
};

const getMessagesByPhone = async ({ phone }) => {
  try {
    const messages = await ChatHistory.findAll({
      where: {
        cell_phone: phone,
      },
      order: [['timestamp', 'ASC']],
      raw: true,
    });

    if (!messages) {
      throw new Error('Failed to retrieve messages by phone');
    }

    return messages;
  } catch (error) {
    throw new Error(`Repository error: ${error.message}`);
  }
};

export default {
  getAllContactsWithMessages,
  getMessagesByPhone,
};
