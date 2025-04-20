import { DataTypes } from 'sequelize';

const PetTemperament = (sequelize) => {
  const model = sequelize.define(
    'PetTemperament',
    {
      id: {
        type: DataTypes.UUID,
        primaryKey: true,
        defaultValue: DataTypes.UUIDV4,
      },
      name: {
        type: DataTypes.STRING(50),
        allowNull: false,
        unique: true,
      },
      label: {
        type: DataTypes.STRING(50),
        allowNull: false,
      },
      position: {
        type: DataTypes.INTEGER,
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
      tableName: 'pet_temperaments',
      timestamps: false,
      underscored: true,
    },
  );

  model.associate = (models) => {
    model.hasMany(models.Pet, {
      foreignKey: 'pet_temperament_id',
      as: 'pets',
    });
  };

  return model;
};

export default PetTemperament;
