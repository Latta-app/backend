import { DataTypes } from 'sequelize';

const PetOwnerPet = (sequelize) => {
  const model = sequelize.define(
    'PetOwnerPet',
    {
      id: {
        type: DataTypes.UUID,
        primaryKey: true,
        defaultValue: DataTypes.UUIDV4,
      },
      pet_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: {
          model: 'pets',
          key: 'id',
        },
      },
      pet_owner_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: {
          model: 'pet_owners',
          key: 'id',
        },
      },
      is_main_owner: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
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
      tableName: 'pet_owner_pets',
      timestamps: false,
      underscored: true,
    },
  );

  return model;
};

export default PetOwnerPet;
