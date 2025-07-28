import { DataTypes } from 'sequelize';

const ChatHistoryContacts = (sequelize) => {
  const model = sequelize.define(
    'ChatHistoryContacts',
    {
      id: {
        type: DataTypes.UUID,
        primaryKey: true,
        defaultValue: DataTypes.UUIDV4,
        allowNull: false,
      },
      contact_name: {
        type: DataTypes.STRING(255),
        allowNull: true,
      },
      cellphone: {
        type: DataTypes.STRING(20),
        allowNull: true,
      },
      contact_phone: {
        type: DataTypes.STRING(20),
        allowNull: true,
      },
      message_id: {
        type: DataTypes.STRING(255),
        allowNull: true,
      },
      chat_history_id: {
        type: DataTypes.UUID,
        allowNull: true,
      },
      created_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },
      updated_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },
    },
    {
      tableName: 'chat_history_contacts',
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: 'updated_at',
      underscored: true,
      indexes: [
        {
          fields: ['chat_history_id'],
          name: 'chat_history_contacts_chat_history_id_idx',
        },
        {
          fields: ['cellphone'],
          name: 'chat_history_contacts_cellphone_idx',
        },
        {
          fields: ['contact_phone'],
          name: 'chat_history_contacts_contact_phone_idx',
        },
        {
          fields: ['message_id'],
          name: 'chat_history_contacts_message_id_idx',
        },
      ],
    },
  );

  model.associate = (models) => {
    model.belongsTo(models.ChatHistory, {
      foreignKey: 'chat_history_id',
      as: 'chatHistory',
    });
  };

  return model;
};

export default ChatHistoryContacts;
