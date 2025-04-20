import { DataTypes } from 'sequelize';

const UserRole = (sequelize) => {
  const model = sequelize.define('UserRole', {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4,
    },
    role: {
      type: DataTypes.STRING(50),
      allowNull: false,
      unique: true,
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
  }, {
    tableName: 'user_roles',
    timestamps: false,
    underscored: true,
  });

  model.associate = (models) => {
    model.hasMany(models.User, {
      foreignKey: 'role_id',
      as: 'users'
    });
  };

  return model;
};

export default UserRole;
