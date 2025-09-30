import { DataTypes } from 'sequelize';

const PetOwnerClinicService = (sequelize) => {
  const model = sequelize.define(
    'PetOwnerClinicService',
    {
      id: {
        type: DataTypes.UUID,
        primaryKey: true,
        defaultValue: DataTypes.UUIDV4,
      },
      pet_owner_clinic_id: {
        type: DataTypes.UUID,
        references: {
          model: 'pet_owner_clinics',
          key: 'id',
        },
      },
      clinic_service_id: {
        type: DataTypes.UUID,
        references: {
          model: 'clinic_services',
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
      tableName: 'pet_owner_clinic_services',
      timestamps: false,
      underscored: true,
    },
  );

  model.associate = (models) => {
    model.belongsTo(models.PetOwnerClinic, {
      foreignKey: 'pet_owner_clinic_id',
      as: 'petOwnerClinic',
    });

  };

  return model;
};

export default PetOwnerClinicService;
