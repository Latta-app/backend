import { DataTypes } from 'sequelize';

const PaymentMethod = (sequelize) => {
  const model = sequelize.define(
    'PaymentMethod',
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
      requires_authorization: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
      },
      is_installment_available: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
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
      tableName: 'payment_method',
      timestamps: false,
      underscored: true,
    },
  );

  model.associate = (models) => {};

  return model;
};

export default PaymentMethod;
