// models/userRole.model.js
import { DataTypes } from 'sequelize';

const UserRole = (sequelize) => {
  const model = sequelize.define(
    'UserRole',
    {
      id: {
        type: DataTypes.UUID,
        primaryKey: true,
        defaultValue: DataTypes.UUIDV4,
      },
      user_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: {
          model: 'users',
          key: 'id',
        },
        onDelete: 'CASCADE',
      },
      role_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: {
          model: 'roles',
          key: 'id',
        },
        onDelete: 'CASCADE',
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
      tableName: 'user_roles',
      timestamps: false,
      underscored: true,
      indexes: [
        {
          unique: true,
          fields: ['user_id', 'role_id'],
          name: 'unique_user_role',
        },
      ],
    },
  );

  model.associate = (models) => {
    model.belongsTo(models.User, {
      foreignKey: 'user_id',
      as: 'user',
    });

    model.belongsTo(models.Role, {
      foreignKey: 'role_id',
      as: 'role',
    });
  };

  return model;
};

export default UserRole;
