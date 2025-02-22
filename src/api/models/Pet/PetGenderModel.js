import { DataTypes } from 'sequelize';

const PetGender = (sequelize) => {
  const model = sequelize.define(
    'PetGender',
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
      tableName: 'pet_genders',
      timestamps: false,
      underscored: true,
    },
  );

  model.associate = (models) => {
    model.hasMany(models.Pet, {
      foreignKey: 'pet_gender_id',
      as: 'pets',
    });
  };

  return model;
};

export default PetGender;
