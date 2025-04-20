import { DataTypes } from 'sequelize';

const PetFurLength = (sequelize) => {
  const model = sequelize.define(
    'PetFurLength',
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
      tableName: 'pet_fur_lengths',
      timestamps: false,
      underscored: true,
    },
  );

  model.associate = (models) => {
    model.hasMany(models.Pet, {
      foreignKey: 'pet_fur_length_id',
      as: 'pets',
    });
  };

  return model;
};

export default PetFurLength;
