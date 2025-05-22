// models/user.model.js
import { DataTypes } from 'sequelize';

const User = (sequelize) => {
  const model = sequelize.define(
    'User',
    {
      id: {
        type: DataTypes.UUID,
        primaryKey: true,
        defaultValue: DataTypes.UUIDV4,
      },
      clinic_id: {
        type: DataTypes.UUID,
        allowNull: true,
        references: {
          model: 'clinics',
          key: 'id',
        },
      },
      role_id: {
        type: DataTypes.UUID,
        allowNull: true,
        references: {
          model: 'roles',
          key: 'id',
        },
      },
      name: {
        type: DataTypes.STRING(255),
        allowNull: false,
        unique: false,
      },
      email: {
        type: DataTypes.STRING(255),
        allowNull: false,
        unique: true,
        validate: {
          isEmail: true,
        },
      },
      password: {
        type: DataTypes.STRING(255),
        allowNull: false,
      },
      phone: {
        type: DataTypes.STRING(20),
        allowNull: false,
        validate: {
          isNumeric: true,
          len: [10, 15],
        },
      },
      photo: {
        type: DataTypes.STRING(255),
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
      tableName: 'users',
      timestamps: false,
      underscored: true,
    },
  );

  model.associate = (models) => {
    model.belongsTo(models.Clinic, {
      foreignKey: 'clinic_id',
      as: 'clinic',
    });

    model.belongsTo(models.Role, {
      foreignKey: 'role_id',
      as: 'role',
    });
  };

  return model;
};

export default User;
