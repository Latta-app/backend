import { DataTypes } from 'sequelize';

const Protocol = (sequelize) => {
  const model = sequelize.define('Protocol', {
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
    pet_type_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'pet_types',
        key: 'id',
      },
    },
    vaccine_name: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    initial_dose_age: {
      type: DataTypes.INTEGER,
      allowNull: false,
      validate: {
        min: 0,
      },
    },
    booster_frequency: {
      type: DataTypes.INTEGER,
      allowNull: false,
      validate: {
        min: 1,
      },
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
  }, {
    tableName: 'protocols',
    timestamps: false,
    underscored: true,
  });

  model.associate = (models) => {
    model.belongsTo(models.Clinic, {
      foreignKey: 'clinic_id',
      as: 'clinic'
    });
    
    model.belongsTo(models.PetType, {
      foreignKey: 'pet_type_id',
      as: 'petType'
    });
  };

  return model;
};

export default Protocol;
