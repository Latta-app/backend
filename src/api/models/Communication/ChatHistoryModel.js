import { DataTypes } from 'sequelize';

const ChatHistory = (sequelize) => {
  const model = sequelize.define(
    'ChatHistory',
    {
      id: {
        type: DataTypes.UUID,
        primaryKey: true,
        defaultValue: DataTypes.UUIDV4,
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
        type: DataTypes.TEXT,
        allowNull: true,
      },
      timestamp: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      window_timestamp: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      message: {
        type: DataTypes.TEXT,
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
        type: DataTypes.STRING,
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
        type: DataTypes.TEXT,
        allowNull: true,
      },
      ai_output: {
        type: DataTypes.TEXT,
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
    },
    {
      tableName: 'chat_history',
      timestamps: false,
      underscored: true,
    },
  );

  model.associate = (models) => {
    model.belongsTo(models.Clinic, {
      foreignKey: 'clinic_id',
      as: 'clinic',
    });

    model.belongsTo(models.PetOwner, {
      foreignKey: 'pet_owner_id',
      as: 'petOwner',
    });

    model.belongsTo(models.Contact, {
      foreignKey: 'contact_id',
      as: 'contact',
    });
  };

  return model;
};

export default ChatHistory;
