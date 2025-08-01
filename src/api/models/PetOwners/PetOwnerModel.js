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
        allowNull: false,
        references: {
          model: 'clinics',
          key: 'id',
        },
      },
      name: {
        type: DataTypes.STRING(200),
        allowNull: false,
      },
      email: {
        type: DataTypes.STRING(255),
        allowNull: false,
      },
      cell_phone: {
        type: DataTypes.STRING(20),
        allowNull: true,
      },
      cpf: {
        type: DataTypes.STRING(14),
        allowNull: true,
      },
      rg: {
        type: DataTypes.STRING(20),
        allowNull: true,
      },
      date_of_birth: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      address_street: {
        type: DataTypes.STRING(255),
        allowNull: true,
      },
      address_number: {
        type: DataTypes.STRING(20),
        allowNull: true,
      },
      address_complement: {
        type: DataTypes.STRING(100),
        allowNull: true,
      },
      address_neighborhood: {
        type: DataTypes.STRING(100),
        allowNull: true,
      },
      address_city: {
        type: DataTypes.STRING(100),
        allowNull: true,
      },
      address_state: {
        type: DataTypes.STRING(2),
        allowNull: true,
      },
      address_zipcode: {
        type: DataTypes.STRING(9),
        allowNull: true,
      },
      emergency_contact_name: {
        type: DataTypes.STRING(200),
        allowNull: true,
      },
      emergency_contact_phone: {
        type: DataTypes.STRING(20),
        allowNull: true,
      },
      occupation: {
        type: DataTypes.STRING(100),
        allowNull: true,
      },
      is_active: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },
      has_platform_access: {
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
  };

  return model;
};

export default PetOwner;
