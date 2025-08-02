import { DataTypes } from 'sequelize';

const PetOwnerTag = (sequelize) => {
  const model = sequelize.define(
    'PetOwnerTag',
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
        type: DataTypes.STRING(100),
        allowNull: false,
      },
      label: {
        type: DataTypes.STRING(100),
        allowNull: false,
      },
      color: {
        type: DataTypes.STRING(7),
        allowNull: false,
        defaultValue: '#6B7280',
      },
      is_active: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
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
      tableName: 'pet_owner_tags',
      timestamps: false,
      underscored: true,
      indexes: [
        {
          unique: true,
          fields: ['clinic_id', 'name'],
          name: 'unique_tag_name_per_clinic',
        },
      ],
    },
  );

  model.associate = (models) => {
    model.belongsTo(models.Clinic, {
      foreignKey: 'clinic_id',
      as: 'clinic',
    });

    model.belongsToMany(models.PetOwner, {
      through: models.PetOwnerTagAssignment,
      foreignKey: 'tag_id',
      otherKey: 'pet_owner_id',
      as: 'petOwners',
    });

    model.hasMany(models.PetOwnerTagAssignment, {
      foreignKey: 'tag_id',
      as: 'assignments',
    });
  };

  return model;
};

export default PetOwnerTag;
