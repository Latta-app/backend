import { DataTypes } from 'sequelize';

const PetSubscription = (sequelize) => {
  const model = sequelize.define(
    'PetSubscription',
    {
      id: {
        type: DataTypes.UUID,
        primaryKey: true,
        defaultValue: DataTypes.UUIDV4,
        unique: true,
      },
      name: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      service_type_id: {
        type: DataTypes.UUID,
        allowNull: true,
        references: {
          model: 'service_type',
          key: 'id',
        },
      },
      pet_size_id: {
        type: DataTypes.UUID,
        allowNull: true,
        references: {
          model: 'pet_sizes',
          key: 'id',
        },
      },
      pet_fur_length_id: {
        type: DataTypes.UUID,
        allowNull: true,
        references: {
          model: 'pet_fur_lengths',
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
      tableName: 'pet_subscriptions',
      timestamps: false,
      underscored: true,
    },
  );

  model.associate = (models) => {
    if (models.ServiceType) {
      model.belongsTo(models.ServiceType, {
        foreignKey: 'service_type_id',
        as: 'serviceType',
      });
    }

    if (models.PetSize) {
      model.belongsTo(models.PetSize, {
        foreignKey: 'pet_size_id',
        as: 'petSize',
      });
    }

    if (models.PetFurLength) {
      model.belongsTo(models.PetFurLength, {
        foreignKey: 'pet_fur_length_id',
        as: 'petFurLength',
      });
    }

    if (models.Pet) {
      model.hasMany(models.Pet, {
        foreignKey: 'pet_subscription_id',
        as: 'pets',
      });
    }
  };

  return model;
};

export default PetSubscription;
