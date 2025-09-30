import { DataTypes } from 'sequelize';

const PetOwnerClinic = (sequelize) => {
  const model = sequelize.define(
    'PetOwnerClinic',
    {
      id: {
        type: DataTypes.UUID,
        primaryKey: true,
        defaultValue: DataTypes.UUIDV4,
      },
      pet_owner_id: {
        type: DataTypes.UUID,
        references: {
          model: 'pet_owners',
          key: 'id',
        },
      },
      clinic_id: {
        type: DataTypes.UUID,
        references: {
          model: 'clinics',
          key: 'id',
        },
      },
      created_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: sequelize.fn('NOW'),
      },
    },
    {
      tableName: 'pet_owner_clinics',
      timestamps: false,
      underscored: true,
    },
  );

  model.associate = (models) => {
    model.belongsTo(models.PetOwner, {
      foreignKey: 'pet_owner_id',
      as: 'petOwner',
    });

    model.belongsTo(models.Clinic, {
      foreignKey: 'clinic_id',
      as: 'clinic',
    });

    model.hasMany(models.PetOwnerClinicService, {
      foreignKey: 'pet_owner_clinic_id',
      as: 'services',
    });
  };

  return model;
};

export default PetOwnerClinic;
