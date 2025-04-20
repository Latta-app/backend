import { DataTypes } from 'sequelize';

const Scheduling = (sequelize) => {
  const model = sequelize.define(
    'Scheduling',
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
        onDelete: 'CASCADE',
      },
      service_type_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: {
          model: 'service_type',
          key: 'id',
        },
        onDelete: 'CASCADE',
      },
      scheduling_status_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: {
          model: 'scheduling_status',
          key: 'id',
        },
        onDelete: 'CASCADE',
        defaultValue: 'd3162e72-8f92-4100-b68c-3ea1c24aab5b',
      },
      user_id: {
        type: DataTypes.UUID,
        allowNull: true,
        references: {
          model: 'users',
          key: 'id',
        },
        onDelete: 'CASCADE',
      },
      plan_id: {
        type: DataTypes.UUID,
        allowNull: true,
        references: {
          model: 'plans',
          key: 'id',
        },
        onDelete: 'CASCADE',
      },
      pet_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: {
          model: 'pets',
          key: 'id',
        },
        onDelete: 'CASCADE',
      },
      pet_owner_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: {
          model: 'pet_owners',
          key: 'id',
        },
        onDelete: 'CASCADE',
      },
      payment_method_id: {
        type: DataTypes.UUID,
        allowNull: true,
        references: {
          model: 'payment_method',
          key: 'id',
        },
        onDelete: 'CASCADE',
      },
      payment_status_id: {
        type: DataTypes.UUID,
        allowNull: true,
        references: {
          model: 'payment_status',
          key: 'id',
        },
        onDelete: 'CASCADE',
      },
      appointment_date: {
        type: DataTypes.DATEONLY,
        allowNull: false,
      },
      start_time: {
        type: DataTypes.DATE,
        allowNull: false,
      },
      end_time: {
        type: DataTypes.DATE,
        allowNull: false,
      },
      price: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: true,
      },
      notes: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      is_confirmed: {
        type: DataTypes.BOOLEAN,
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
      tableName: 'scheduling',
      timestamps: false,
      underscored: true,
    },
  );

  model.associate = (models) => {
    model.belongsTo(models.Clinic, {
      foreignKey: 'clinic_id',
      as: 'clinic',
    });
    model.belongsTo(models.ServiceType, {
      foreignKey: 'service_type_id',
      as: 'serviceType',
    });
    model.belongsTo(models.SchedulingStatus, {
      foreignKey: 'scheduling_status_id',
      as: 'schedulingStatus',
    });
    model.belongsTo(models.User, {
      foreignKey: 'user_id',
      as: 'user',
    });
    model.belongsTo(models.Plan, {
      foreignKey: 'plan_id',
      as: 'plan',
    });
    model.belongsTo(models.Pet, {
      foreignKey: 'pet_id',
      as: 'pet',
    });
    model.belongsTo(models.PetOwner, {
      foreignKey: 'pet_owner_id',
      as: 'petOwner',
    });
    model.belongsTo(models.PaymentMethod, {
      foreignKey: 'payment_method_id',
      as: 'paymentMethod',
    });
    model.belongsTo(models.PaymentStatus, {
      foreignKey: 'payment_status_id',
      as: 'paymentStatus',
    });
  };

  return model;
};

export default Scheduling;
