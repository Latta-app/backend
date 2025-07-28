import { Sequelize } from 'sequelize';
import {
  ChatHistory,
  ChatHistoryContacts,
  Contact,
  Pet,
  PetBreed,
  PetFurLength,
  PetGender,
  PetOwner,
  PetSize,
  PetType,
} from '../models/index.js';
import { isValidUUID } from '../../utils/validate.js';

// const getAllContactsWithMessages = async ({ clinic_id, page = 1, limit = 15 }) => {
//   // TRAZ TODO MUNDO
//   try {
//     const offset = (page - 1) * limit;

//     const { count: totalItems, rows: contacts } = await Contact.findAndCountAll({
//       where: {
//         clinic_id,
//       },
//       limit,
//       offset,
//       order: [
//         [
//           Sequelize.literal(`(
//           CASE
//             WHEN EXISTS (
//               SELECT 1 FROM chat_history
//               WHERE chat_history.contact_id = "Contact".id
//             )
//             THEN 0
//             ELSE 1
//           END
//         )`),
//           'ASC',
//         ],
//         [
//           Sequelize.literal(`(
//           SELECT MAX(chat_history.timestamp)
//           FROM chat_history
//           WHERE chat_history.contact_id = "Contact".id
//         )`),
//           'DESC',
//         ],
//         ['updated_at', 'DESC'],
//       ],
//       include: [
//         {
//           model: ChatHistory,
//           as: 'chatHistory',
//           attributes: [
//             'id',
//             'message',
//             'sent_by',
//             'sent_to',
//             'role',
//             'timestamp',
//             'window_timestamp',
//             'journey',
//             'message_type',
//             'date',
//             'message_id',
//             'midia_url',
//             'midia_name',
//           ],
//           order: [['timestamp', 'ASC']],
//           include: [
//             {
//               model: ChatHistoryContacts,
//               as: 'chatHistoryContacts',
//               attributes: [
//                 'id',
//                 'contact_name',
//                 'cellphone',
//                 'contact_phone',
//                 'message_id',
//                 'created_at',
//                 'updated_at',
//               ],
//             },
//           ],
//         },
//         {
//           model: PetOwner,
//           as: 'petOwner',
//           attributes: [
//             'id',
//             'name',
//             'email',
//             'cell_phone',
//             'cpf',
//             'date_of_birth',
//             'is_active',
//             'created_at',
//           ],
//           include: [
//             {
//               model: Pet,
//               as: 'pets',
//               attributes: ['id', 'name', 'date_of_birthday', 'photo'],
//               through: { attributes: [] },
//               where: {
//                 is_active: true,
//                 death_date: null,
//               },
//               required: false,
//               include: [
//                 { model: PetType, as: 'type', attributes: ['id', 'name', 'label'] },
//                 { model: PetBreed, as: 'breed', attributes: ['id', 'name', 'label'] },
//                 { model: PetGender, as: 'gender', attributes: ['id', 'name', 'label'] },
//                 { model: PetSize, as: 'size', attributes: ['id', 'name', 'label'] },
//                 { model: PetFurLength, as: 'furLength', attributes: ['id', 'name', 'label'] },
//               ],
//             },
//           ],
//         },
//       ],
//     });

//     return {
//       contacts,
//       totalItems,
//     };
//   } catch (error) {
//     throw new Error(`Repository error: ${error.message}`);
//   }
// };

const getAllContactsWithMessages = async ({ clinic_id, page = 1, limit = 15 }) => {
  try {
    const offset = (page - 1) * limit;

    const { count: totalItems, rows: contacts } = await Contact.findAndCountAll({
      where: {
        clinic_id,
      },
      limit,
      offset,
      order: [
        [
          Sequelize.literal(`(
            SELECT MAX(chat_history.timestamp)
            FROM chat_history
            WHERE chat_history.contact_id = "Contact".id
          )`),
          'DESC',
        ],
        ['updated_at', 'DESC'],
        [{ model: ChatHistory, as: 'chatHistory' }, 'timestamp', 'ASC'],
      ],
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
            'reply',
          ],
          required: true,
          order: [['timestamp', 'ASC']],
          include: [
            {
              model: ChatHistoryContacts,
              as: 'chatHistoryContacts',
              attributes: [
                'id',
                'contact_name',
                'cellphone',
                'contact_phone',
                'message_id',
                'created_at',
                'updated_at',
              ],
            },
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

    return {
      contacts,
      totalItems,
    };
  } catch (error) {
    throw new Error(`Repository error: ${error.message}`);
  }
};

const searchContacts = async ({ clinic_id, name, phone, page = 1, limit = 15 }) => {
  try {
    const { Op } = Sequelize;

    let finalConditions = [];

    if (phone) {
      finalConditions.push({ cellphone: { [Op.iLike]: `%${phone}%` } });
    }

    if (name) {
      const contactsWithPetOwner = await Contact.findAll({
        attributes: ['id'],
        include: [
          {
            model: PetOwner,
            as: 'petOwner',
            where: { name: { [Op.iLike]: `%${name}%` } },
            attributes: ['id'],
            required: true,
          },
        ],
      });

      const contactIds = contactsWithPetOwner.map((c) => c.id);

      const nameConditions = [{ profile_name: { [Op.iLike]: `%${name}%` } }];

      if (contactIds.length > 0) {
        nameConditions.push({ id: { [Op.in]: contactIds } });
      }

      finalConditions.push({ [Op.or]: nameConditions });
    }

    const offset = (page - 1) * limit;

    const whereConditions = {
      clinic_id,
      ...(finalConditions.length > 0 ? { [Op.or]: finalConditions } : {}),
    };

    const contacts = await Contact.findAll({
      where: whereConditions,
      limit: parseInt(limit),
      offset: parseInt(offset),
      order: [
        [
          Sequelize.literal(`(
            CASE
              WHEN EXISTS (
                SELECT 1 FROM chat_history
                WHERE chat_history.contact_id = "Contact".id
              )
              THEN 0
              ELSE 1
            END
          )`),
          'ASC',
        ],
        [
          Sequelize.literal(`(
            SELECT MAX(chat_history.timestamp)
            FROM chat_history
            WHERE chat_history.contact_id = "Contact".id
          )`),
          'DESC',
        ],
        ['updated_at', 'DESC'],
        [{ model: ChatHistory, as: 'chatHistory' }, 'timestamp', 'ASC'],
      ],
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
          order: [['timestamp', 'ASC']],
          include: [
            {
              model: ChatHistoryContacts,
              as: 'chatHistoryContacts',
              attributes: [
                'id',
                'contact_name',
                'cellphone',
                'contact_phone',
                'message_id',
                'created_at',
                'updated_at',
              ],
            },
          ],
          required: false,
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
          required: false,
          include: [
            {
              model: Pet,
              as: 'pets',
              attributes: ['id', 'name', 'date_of_birthday', 'photo'],
              through: { attributes: [] },
              where: {
                is_active: true,
                death_date: null,
              },
              required: false,
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

    return contacts;
  } catch (error) {
    throw new Error(`Repository error: ${error.message}`);
  }
};

const getReplyMessageById = async ({ replyId }) => {
  if (!replyId) return null;

  return await ChatHistory.findOne({
    where: { id: replyId },
    attributes: [
      'id',
      'message',
      'sent_by',
      'sent_to',
      'timestamp',
      'message_type',
      'midia_url',
      'midia_name',
      'role',
    ],
    include: [
      {
        model: ChatHistoryContacts,
        as: 'chatHistoryContacts',
        attributes: ['contact_name', 'contact_phone'],
      },
      {
        model: Contact,
        as: 'contact',
        attributes: ['profile_name'],
        required: false,
        include: [
          {
            model: PetOwner,
            as: 'petOwner',
            attributes: ['name'],
            required: false,
          },
        ],
      },
    ],
  });
};

export default {
  getAllContactsWithMessages,
  searchContacts,
  getReplyMessageById,
};
