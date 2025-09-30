import { DataTypes } from 'sequelize';

const PetOwner = (sequelize) => {
  const model = sequelize.define(
    'PetOwner',
    {
      id: {
        type: DataTypes.UUID,
        primaryKey: true,
        defaultValue: DataTypes.UUIDV4,
      },
      clinic_id: {
        type: DataTypes.UUID,
        references: {
          model: 'clinics',
          key: 'id',
        },
      },
      name: {
        type: DataTypes.STRING(200),
      },
      email: {
        type: DataTypes.STRING(255),
        defaultValue: null,
      },
      cell_phone: {
        type: DataTypes.STRING(20),
      },
      cpf: {
        type: DataTypes.STRING(14),
        defaultValue: null,
      },
      rg: {
        type: DataTypes.STRING(20),
        defaultValue: null,
      },
      date_of_birth: {
        type: DataTypes.DATEONLY,
      },
      address_street: {
        type: DataTypes.STRING(255),
        defaultValue: null,
      },
      address_number: {
        type: DataTypes.STRING(20),
        defaultValue: null,
      },
      address_complement: {
        type: DataTypes.STRING(100),
        defaultValue: null,
      },
      address_neighborhood: {
        type: DataTypes.STRING(100),
        defaultValue: null,
      },
      address_city: {
        type: DataTypes.STRING(100),
        defaultValue: null,
      },
      address_state: {
        type: DataTypes.STRING(2),
        defaultValue: null,
      },
      address_zipcode: {
        type: DataTypes.STRING(9),
        defaultValue: null,
      },
      emergency_contact_name: {
        type: DataTypes.STRING(200),
        defaultValue: null,
      },
      emergency_contact_phone: {
        type: DataTypes.STRING(20),
        defaultValue: null,
      },
      occupation: {
        type: DataTypes.STRING(100),
        defaultValue: null,
      },
      is_active: {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
      },
      has_platform_access: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
      },
      infographic: {
        type: DataTypes.STRING,
      },
      taxi_dog_user: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
      },
      latta_choice: {
        type: DataTypes.STRING,
        defaultValue: 'não',
      },
      preferred_clinic: {
        type: DataTypes.STRING,
        defaultValue: 'não',
      },
      questioned: {
        type: DataTypes.STRING,
        defaultValue: 'não',
      },
      pet_photo_commented: {
        type: DataTypes.STRING,
        defaultValue: 'não',
      },
      interactions: {
        type: DataTypes.DECIMAL,
        defaultValue: 0,
      },
      varejo_id: {
        type: DataTypes.STRING,
      },
      created_at: {
        type: DataTypes.DATE,
        defaultValue: sequelize.fn('CURRENT_TIMESTAMP'),
      },
      updated_at: {
        type: DataTypes.DATE,
        defaultValue: sequelize.fn('CURRENT_TIMESTAMP'),
      },
    },
    {
      tableName: 'pet_owners',
      timestamps: false,
      underscored: true,
    },
  );

  model.associate = (models) => {
    model.belongsTo(models.Clinic, {
      foreignKey: 'clinic_id',
      as: 'clinic',
    });

    model.belongsToMany(models.Pet, {
      through: 'pet_owner_pets',
      foreignKey: 'pet_owner_id',
      otherKey: 'pet_id',
      as: 'pets',
    });

    model.belongsToMany(models.PetOwnerTag, {
      through: models.PetOwnerTagAssignment,
      foreignKey: 'pet_owner_id',
      otherKey: 'tag_id',
      as: 'tags',
    });

    model.hasMany(models.PetOwnerTagAssignment, {
      foreignKey: 'pet_owner_id',
      as: 'tagAssignments',
    });

    model.hasMany(models.PetOwnerClinic, {
      foreignKey: 'pet_owner_id',
      as: 'petOwnerClinics',
    });

    model.belongsToMany(models.Clinic, {
      through: models.PetOwnerClinic,
      foreignKey: 'pet_owner_id',
      otherKey: 'clinic_id',
      as: 'clinics',
    });
  };

  return model;
};

export default PetOwner;
