import ChatRepository from '../repositories/chat-history.repository.js';

const getAllMessages = async () => {
  try {
    // Buscar todas as mensagens do repository
    const allMessages = await ChatRepository.getAllMessages();

    if (!allMessages || allMessages.length === 0) {
      return [];
    }

    // Agrupar mensagens por número de telefone
    const groupedMessages = allMessages.reduce((acc, message) => {
      const phone = message.cell_phone;

      // Se não existe esse telefone no acumulador, criar entrada
      if (!acc[phone]) {
        acc[phone] = {
          phone: phone,
          name: message.name,
          messages: [],
        };
      }

      // Adicionar a mensagem ao grupo
      acc[phone].messages.push({
        id: message.id,
        message: message.message,
        sent_by: message.sent_by,
        role: message.role,
        timestamp: message.timestamp,
        window_timestamp: message.window_timestamp,
        journey: message.journey,
      });

      return acc;
    }, {});

    // Converter objeto em array e ordenar mensagens por timestamp
    const result = Object.values(groupedMessages).map((group) => ({
      ...group,
      messages: group.messages.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp)),
    }));

    return result;
  } catch (error) {
    throw new Error(`Service error: ${error.message}`);
  }
};

const getMessagesByPhone = async ({ phone }) => {
  try {
    if (!phone) {
      throw new Error('Phone parameter is required');
    }

    // Buscar mensagens por telefone específico
    const messages = await ChatRepository.getMessagesByPhone({ phone });

    if (!messages || messages.length === 0) {
      return {
        phone: phone,
        name: null,
        messages: [],
      };
    }

    // Ordenar mensagens por timestamp
    const sortedMessages = messages.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

    // Retornar no mesmo formato agrupado
    return {
      phone: phone,
      name: messages[0].name, // Pegar o nome da primeira mensagem
      messages: sortedMessages.map((message) => ({
        id: message.id,
        message: message.message,
        sent_by: message.sent_by,
        timestamp: message.timestamp,
        window_timestamp: message.window_timestamp,
        journey: message.journey,
      })),
    };
  } catch (error) {
    throw new Error(`Service error: ${error.message}`);
  }
};

export default {
  getAllMessages,
  getMessagesByPhone,
};
