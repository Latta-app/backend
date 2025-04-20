import { DataTypes } from 'sequelize';

const PetSocializationLevel = (sequelize) => {
  const model = sequelize.define(
    'PetSocializationLevel',
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
      tableName: 'pet_socialization_levels',
      timestamps: false,
      underscored: true,
    },
  );

  model.associate = (models) => {
    model.hasMany(models.Pet, {
      foreignKey: 'pet_socialization_level_id',
      as: 'pets',
    });
  };

  return model;
};

export default PetSocializationLevel;
