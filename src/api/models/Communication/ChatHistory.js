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
  };

  return model;
};

export default ChatHistory;
