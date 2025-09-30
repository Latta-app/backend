import { DataTypes } from 'sequelize';

const Clinic = (sequelize) => {
  const model = sequelize.define(
    'Clinic',
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
      created_at: {
        type: DataTypes.DATE,
        defaultValue: sequelize.fn('CURRENT_TIMESTAMP'),
      },
      updated_at: {
        type: DataTypes.DATE,
        defaultValue: sequelize.fn('CURRENT_TIMESTAMP'),
      },
      contato: {
        type: DataTypes.STRING,
      },
      credenciado: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: 'não',
      },
      agendamentos: {
        type: DataTypes.DECIMAL,
        allowNull: false,
        defaultValue: 0,
      },
      not_interested: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: 'não',
      },
      offers_taxi_dog: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: 'não',
      },
      address: {
        type: DataTypes.STRING,
      },
      neighbourhood: {
        type: DataTypes.STRING,
      },
      city: {
        type: DataTypes.STRING,
      },
      interested: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: 'não',
      },
      website: {
        type: DataTypes.STRING,
      },
      opening_hours: {
        type: DataTypes.STRING,
      },
      whatsapp_available: {
        type: DataTypes.STRING,
        defaultValue: '0',
      },
      rating: {
        type: DataTypes.STRING,
      },
      number_comments: {
        type: DataTypes.STRING,
      },
      state: {
        type: DataTypes.STRING,
      },
      zip_code: {
        type: DataTypes.STRING,
      },
      evolution_instance: {
        type: DataTypes.STRING,
      },
    },
    {
      tableName: 'clinics',
      timestamps: false,
      underscored: true,
    },
  );

  model.associate = (models) => {
    model.hasMany(models.User, {
      foreignKey: 'clinic_id',
      as: 'users',
    });

    model.hasMany(models.PetOwner, {
      foreignKey: 'clinic_id',
      as: 'petOwners',
    });

    model.hasMany(models.PetOwnerClinic, {
      foreignKey: 'clinic_id',
      as: 'petOwnerClinics',
    });

    model.belongsToMany(models.PetOwner, {
      through: models.PetOwnerClinic,
      foreignKey: 'clinic_id',
      otherKey: 'pet_owner_id',
      as: 'associatedPetOwners',
    });
  };

  return model;
};

export default Clinic;
