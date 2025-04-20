import { DataTypes } from 'sequelize';

const ServiceType = (sequelize) => {
  const model = sequelize.define(
    'ServiceType',
    {
      id: {
        type: DataTypes.UUID,
        primaryKey: true,
        defaultValue: DataTypes.UUIDV4,
      },
      name: {
        type: DataTypes.STRING(255),
        allowNull: false,
        unique: true,
      },
      label: {
        type: DataTypes.STRING(255),
        allowNull: false,
      },
      emoji: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      color: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      created_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: sequelize.fn('NOW'),
      },
      updated_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: sequelize.fn('NOW'),
      },
    },
    {
      tableName: 'service_type',
      timestamps: false,
      underscored: true,
    },
  );

  model.associate = (models) => {};

  return model;
};

export default ServiceType;
