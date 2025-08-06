import { DataTypes } from 'sequelize';

const ChatHistory = (sequelize) => {
  const model = sequelize.define(
    'ChatHistory',
    {
      id: {
        type: DataTypes.UUID,
        primaryKey: true,
        defaultValue: DataTypes.UUIDV4,
        allowNull: false,
      },
      clinic_id: {
        type: DataTypes.UUID,
        allowNull: true,
      },
      name: {
        type: DataTypes.STRING(200),
        allowNull: true,
      },
      cell_phone: {
        type: DataTypes.STRING(20),
        allowNull: true,
      },
      journey: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      timestamp: {
        type: DataTypes.DATE,
        allowNull: true,
        defaultValue: DataTypes.NOW,
      },
      window_timestamp: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      message: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      sent_by: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      sent_to: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      role: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      message_type: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      date: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      message_id: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      midia_url: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      midia_name: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      thumb_url: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      ai_accepted: {
        type: DataTypes.BOOLEAN,
        allowNull: true,
      },
      reply: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      ai_output: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      pet_owner_id: {
        type: DataTypes.UUID,
        allowNull: true,
      },
      contact_id: {
        type: DataTypes.UUID,
        allowNull: true,
      },
      path: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      is_modified: {
        type: DataTypes.BOOLEAN,
        allowNull: true,
      },
      user_id: {
        type: DataTypes.UUID,
        allowNull: true,
      },
      is_answered: {
        type: DataTypes.BOOLEAN,
        allowNull: true,
        defaultValue: false,
      },
      template_id: {
        type: DataTypes.UUID,
        allowNull: true,
      },
    },
    {
      tableName: 'chat_history',
      timestamps: false,
      underscored: true,
      indexes: [
        {
          fields: ['clinic_id'],
          name: 'chat_history_clinic_id_idx',
        },
        {
          fields: ['contact_id'],
          name: 'chat_history_contact_id_idx',
        },
        {
          fields: ['pet_owner_id'],
          name: 'chat_history_pet_owner_id_idx',
        },
        {
          fields: ['timestamp'],
          name: 'chat_history_timestamp_idx',
        },
        {
          fields: ['message_id'],
          name: 'chat_history_message_id_idx',
        },
      ],
      validate: {
        hasContactIdentifier() {
          if (!this.contact_id && !this.pet_owner_id && !this.cell_phone) {
            throw new Error('Pelo menos um identificador de contato deve ser fornecido');
          }
        },
      },
    },
  );

  model.associate = (models) => {
    model.belongsTo(models.Clinic, {
      foreignKey: 'clinic_id',
      as: 'clinic',
      onDelete: 'CASCADE',
    });

    model.belongsTo(models.PetOwner, {
      foreignKey: 'pet_owner_id',
      as: 'petOwner',
      onDelete: 'SET NULL',
    });

    model.belongsTo(models.Contact, {
      foreignKey: 'contact_id',
      as: 'contact',
      onDelete: 'SET NULL',
    });

    model.belongsTo(models.User, {
      foreignKey: 'user_id',
      as: 'user',
      onDelete: 'SET NULL',
    });

    model.belongsTo(models.Template, {
      foreignKey: 'template_id',
      as: 'template',
      onDelete: 'SET NULL',
    });

    model.hasMany(models.ChatHistoryContacts, {
      foreignKey: 'chat_history_id',
      as: 'chatHistoryContacts',
    });
  };

  return model;
};

export default ChatHistory;
