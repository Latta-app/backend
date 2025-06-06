import { DataTypes } from 'sequelize';

const Clinic = (sequelize) => {
  const model = sequelize.define('Clinic', {
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
    tableName: 'clinics',
    timestamps: false,
    underscored: true,
  });

  model.associate = (models) => {
    model.hasMany(models.User, {
      foreignKey: 'clinic_id',
      as: 'users'
    });
  };

  return model;
};

export default Clinic;