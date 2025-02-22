import { DataTypes } from 'sequelize';

const Pet = (sequelize) => {
  const model = sequelize.define(
    'Pet',
    {
      id: {
        type: DataTypes.UUID,
        primaryKey: true,
        defaultValue: DataTypes.UUIDV4,
      },
      pet_type_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: {
          model: 'pet_types',
          key: 'id',
        },
      },
      pet_gender_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: {
          model: 'pet_genders',
          key: 'id',
        },
      },
      pet_breed_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: {
          model: 'pet_breeds',
          key: 'id',
        },
      },
      pet_color_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: {
          model: 'pet_colors',
          key: 'id',
        },
      },
      pet_size_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: {
          model: 'pet_sizes',
          key: 'id',
        },
      },
      pet_fur_type_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: {
          model: 'pet_fur_types',
          key: 'id',
        },
      },
      pet_fur_length_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: {
          model: 'pet_fur_lengths',
          key: 'id',
        },
      },
      pet_temperament_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: {
          model: 'pet_temperaments',
          key: 'id',
        },
      },
      pet_socialization_level_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: {
          model: 'pet_socialization_levels',
          key: 'id',
        },
      },
      pet_living_environment_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: {
          model: 'pet_living_environment',
          key: 'id',
        },
      },
      name: {
        type: DataTypes.STRING(255),
        allowNull: false,
      },
      date_of_birthday: {
        type: DataTypes.DATE,
        allowNull: false,
      },
      photo: {
        type: DataTypes.STRING(255),
        allowNull: true,
      },
      latest_weight: {
        type: DataTypes.STRING(7),
        allowNull: true,
      },
      microchip_number: {
        type: DataTypes.STRING(50),
        allowNull: true,
      },
      blood_type: {
        type: DataTypes.STRING(20),
        allowNull: true,
      },
      is_neutered: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      is_active: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },
      death_date: {
        type: DataTypes.DATE,
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
      tableName: 'pets',
      timestamps: false,
      underscored: true,
    },
  );

  model.associate = (models) => {
    model.belongsToMany(models.PetOwner, {
      through: 'pet_owner_pets',
      foreignKey: 'pet_id',
      otherKey: 'pet_owner_id',
      as: 'owners',
    });

    model.belongsTo(models.PetType, {
      foreignKey: 'pet_type_id',
      as: 'type',
    });
    model.belongsTo(models.PetBreed, {
      foreignKey: 'pet_breed_id',
      as: 'breed',
    });
    model.belongsTo(models.PetGender, {
      foreignKey: 'pet_gender_id',
      as: 'gender',
    });
    model.belongsTo(models.PetColor, {
      foreignKey: 'pet_color_id',
      as: 'color',
    });
    model.belongsTo(models.PetSize, {
      foreignKey: 'pet_size_id',
      as: 'size',
    });
    model.belongsTo(models.PetFurType, {
      foreignKey: 'pet_fur_type_id',
      as: 'furType',
    });
    model.belongsTo(models.PetFurLength, {
      foreignKey: 'pet_fur_length_id',
      as: 'furLength',
    });
    model.belongsTo(models.PetTemperament, {
      foreignKey: 'pet_temperament_id',
      as: 'temperament',
    });
    model.belongsTo(models.PetSocializationLevel, {
      foreignKey: 'pet_socialization_level_id',
      as: 'socializationLevel',
    });
    model.belongsTo(models.PetLivingEnvironment, {
      foreignKey: 'pet_living_environment_id',
      as: 'livingEnvironment',
    });
    model.belongsTo(models.PetBloodType, {
      foreignKey: 'pet_blood_type_id',
      as: 'bloodType',
    });
  };
  return model;
};

export default Pet;
