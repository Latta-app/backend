import { DataTypes } from 'sequelize';

const PetOwnerTagAssignment = (sequelize) => {
  const model = sequelize.define(
    'PetOwnerTagAssignment',
    {
      id: {
        type: DataTypes.UUID,
        primaryKey: true,
        defaultValue: DataTypes.UUIDV4,
      },
      pet_owner_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: {
          model: 'pet_owners',
          key: 'id',
        },
      },
      tag_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: {
          model: 'pet_owner_tags',
          key: 'id',
        },
      },
      assigned_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: sequelize.fn('NOW'),
      },
      clinic_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: {
          model: 'clinics',
          key: 'id',
        },
      },
      user_id: {
        type: DataTypes.UUID,
        allowNull: true,
        references: {
          model: 'users',
          key: 'id',
        },
      },
    },
    {
      tableName: 'pet_owner_tag_assignments',
      timestamps: false,
      underscored: true,
      indexes: [
        {
          unique: true,
          fields: ['pet_owner_id', 'tag_id'],
          name: 'unique_pet_owner_tag',
        },
      ],
    },
  );

  model.associate = (models) => {
    model.belongsTo(models.PetOwner, {
      foreignKey: 'pet_owner_id',
      as: 'petOwner',
    });

    model.belongsTo(models.PetOwnerTag, {
      foreignKey: 'tag_id',
      as: 'tag',
    });

    model.belongsTo(models.Clinic, {
      foreignKey: 'clinic_id',
      as: 'clinic',
    });

    model.belongsTo(models.User, {
      foreignKey: 'user_id',
      as: 'user',
    });
  };

  return model;
};

export default PetOwnerTagAssignment;
