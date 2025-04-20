import { DataTypes } from 'sequelize';

const SchedulingStatus = (sequelize) => {
  const model = sequelize.define(
    'SchedulingStatus',
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
      tableName: 'scheduling_status',
      timestamps: false,
      underscored: true,
    },
  );

  model.associate = (models) => {};

  return model;
};

export default SchedulingStatus;
