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
        allowNull: true, // Alterado para permitir null
        references: {
          model: 'pet_genders',
          key: 'id',
        },
      },
      pet_breed_id: {
        type: DataTypes.UUID,
        allowNull: true, // Alterado para permitir null
        references: {
          model: 'pet_breeds',
          key: 'id',
        },
      },
      pet_color_id: {
        type: DataTypes.UUID,
        allowNull: true, // Alterado para permitir null
        references: {
          model: 'pet_colors',
          key: 'id',
        },
      },
      pet_size_id: {
        type: DataTypes.UUID,
        allowNull: true, // Alterado para permitir null
        references: {
          model: 'pet_sizes',
          key: 'id',
        },
      },
      pet_fur_type_id: {
        type: DataTypes.UUID,
        allowNull: true, // Alterado para permitir null
        references: {
          model: 'pet_fur_types',
          key: 'id',
        },
      },
      pet_fur_length_id: {
        type: DataTypes.UUID,
        allowNull: true, // Alterado para permitir null
        references: {
          model: 'pet_fur_lengths',
          key: 'id',
        },
      },
      pet_temperament_id: {
        type: DataTypes.UUID,
        allowNull: true, // Alterado para permitir null
        references: {
          model: 'pet_temperaments',
          key: 'id',
        },
      },
      pet_socialization_level_id: {
        type: DataTypes.UUID,
        allowNull: true, // Alterado para permitir null
        references: {
          model: 'pet_socialization_levels',
          key: 'id',
        },
      },
      pet_living_environment_id: {
        type: DataTypes.UUID,
        allowNull: true, // Alterado para permitir null
        references: {
          model: 'pet_living_environment',
          key: 'id',
        },
      },
      pet_blood_type_id: {
        // Campo adicionado
        type: DataTypes.UUID,
        allowNull: true,
        references: {
          model: 'pet_blood_types',
          key: 'id',
        },
      },
      name: {
        type: DataTypes.STRING(255),
        allowNull: false,
      },
      date_of_birthday: {
        type: DataTypes.DATEONLY, // Alterado de DATE para DATEONLY
        allowNull: true, // Alterado para permitir null
      },
      photo: {
        type: DataTypes.STRING(255),
        allowNull: true,
      },
      original_photo: {
        // Campo adicionado
        type: DataTypes.STRING,
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
        // Campo removido - substituído por pet_blood_type_id
        type: DataTypes.STRING(20),
        allowNull: true,
      },
      comments: {
        // Campo adicionado
        type: DataTypes.STRING,
        allowNull: true,
      },
      pet_subscription_id: {
        // Campo adicionado
        type: DataTypes.UUID,
        allowNull: true,
        references: {
          model: 'pet_subscriptions',
          key: 'id',
        },
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
        type: DataTypes.DATEONLY, // Alterado de DATE para DATEONLY
        allowNull: true,
      },
      created_at: {
        type: DataTypes.DATE,
        allowNull: true, // Alterado para permitir null
        defaultValue: sequelize.fn('CURRENT_TIMESTAMP'), // Alterado de 'NOW' para 'CURRENT_TIMESTAMP'
      },
      updated_at: {
        type: DataTypes.DATE,
        allowNull: true, // Alterado para permitir null
        defaultValue: sequelize.fn('CURRENT_TIMESTAMP'), // Alterado de 'NOW' para 'CURRENT_TIMESTAMP'
      },
    },
    {
      tableName: 'pets',
      timestamps: false,
      underscored: true,
      // Adicionando validações personalizadas
      validate: {
        checkDeathDateActive() {
          if (this.is_active === true && this.death_date !== null) {
            throw new Error('Pet ativo não pode ter data de morte');
          }
        },
      },
    },
  );

  model.associate = (models) => {
    // Verificação se PetOwner existe antes de criar a associação
    if (models.PetOwner) {
      model.belongsToMany(models.PetOwner, {
        through: 'pet_owner_pets',
        foreignKey: 'pet_id',
        otherKey: 'pet_owner_id',
        as: 'owners',
      });
    }

    // Associações com verificação de existência
    if (models.PetType) {
      model.belongsTo(models.PetType, {
        foreignKey: 'pet_type_id',
        as: 'type',
      });
    }

    if (models.PetBreed) {
      model.belongsTo(models.PetBreed, {
        foreignKey: 'pet_breed_id',
        as: 'breed',
      });
    }

    if (models.PetGender) {
      model.belongsTo(models.PetGender, {
        foreignKey: 'pet_gender_id',
        as: 'gender',
      });
    }

    if (models.PetColor) {
      model.belongsTo(models.PetColor, {
        foreignKey: 'pet_color_id',
        as: 'color',
      });
    }

    if (models.PetSize) {
      model.belongsTo(models.PetSize, {
        foreignKey: 'pet_size_id',
        as: 'size',
      });
    }

    if (models.PetFurType) {
      model.belongsTo(models.PetFurType, {
        foreignKey: 'pet_fur_type_id',
        as: 'furType',
      });
    }

    if (models.PetFurLength) {
      model.belongsTo(models.PetFurLength, {
        foreignKey: 'pet_fur_length_id',
        as: 'furLength',
      });
    }

    if (models.PetTemperament) {
      model.belongsTo(models.PetTemperament, {
        foreignKey: 'pet_temperament_id',
        as: 'temperament',
      });
    }

    if (models.PetSocializationLevel) {
      model.belongsTo(models.PetSocializationLevel, {
        foreignKey: 'pet_socialization_level_id',
        as: 'socializationLevel',
      });
    }

    if (models.PetLivingEnvironment) {
      model.belongsTo(models.PetLivingEnvironment, {
        foreignKey: 'pet_living_environment_id',
        as: 'livingEnvironment',
      });
    }

    if (models.PetBloodType) {
      model.belongsTo(models.PetBloodType, {
        foreignKey: 'pet_blood_type_id',
        as: 'bloodType',
      });
    }

    if (models.PetSubscription) {
      model.belongsTo(models.PetSubscription, {
        foreignKey: 'pet_subscription_id',
        as: 'subscription',
      });
    }
  };

  return model;
};

export default Pet;
