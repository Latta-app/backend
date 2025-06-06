import { ChatHistory } from '../models/index.js';

const getAllMessages = async () => {
  try {
    const messages = await ChatHistory.findAll({
      order: [['timestamp', 'ASC']], // Ordenar por timestamp crescente
      raw: true, // Retornar dados simples (sem métodos do Sequelize)
    });

    if (!messages) {
      throw new Error('Failed to retrieve messages');
    }
    console.log('messages', messages);
    return messages;
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
      order: [['timestamp', 'ASC']], // Ordenar por timestamp crescente
      raw: true, // Retornar dados simples (sem métodos do Sequelize)
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
  getAllMessages,
  getMessagesByPhone,
};
