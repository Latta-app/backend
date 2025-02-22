import { DataTypes } from 'sequelize';

const PetType = (sequelize) => {
  const model = sequelize.define(
    'PetType',
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
      tableName: 'pet_types',
      timestamps: false,
      underscored: true,
    },
  );

  model.associate = (models) => {
    model.hasMany(models.Pet, {
      foreignKey: 'pet_type_id',
      as: 'pets',
    });
    model.hasMany(models.PetBreed, {
      foreignKey: 'pet_type_id',
      as: 'breeds',
    });
  };

  return model;
};

export default PetType;
