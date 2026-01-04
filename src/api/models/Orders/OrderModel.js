import { DataTypes } from 'sequelize';

const Order = (sequelize) => {
  const model = sequelize.define(
    'Order',
    {
      id: {
        type: DataTypes.UUID,
        primaryKey: true,
        defaultValue: DataTypes.UUIDV4,
      },
      pet_owner_id: {
        type: DataTypes.UUID,
        allowNull: false,
      },
      marketplace: {
        type: DataTypes.STRING(50),
        allowNull: false,
      },
      marketplace_order_id: {
        type: DataTypes.STRING(50),
        allowNull: false,
      },
      status: {
        type: DataTypes.STRING(20),
        allowNull: false,
        defaultValue: 'pending',
      },
      payment_method: {
        type: DataTypes.STRING(20),
        allowNull: false,
      },
      card_brand: {
        type: DataTypes.STRING(20),
        allowNull: true,
      },
      card_last_digits: {
        type: DataTypes.STRING(4),
        allowNull: true,
      },
      subtotal: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 0,
      },
      discount: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 0,
      },
      shipping_cost: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 0,
      },
      service_fee: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 0,
      },
      total: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 0,
      },
      latta_discount: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 0,
      },
      address_id: {
        type: DataTypes.UUID,
        allowNull: true,
      },
      shipping_address_snapshot: {
        type: DataTypes.JSONB,
        allowNull: true,
      },
      is_active: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },
      created_at: {
        type: DataTypes.DATE,
        allowNull: true,
        defaultValue: DataTypes.NOW,
      },
      updated_at: {
        type: DataTypes.DATE,
        allowNull: true,
        defaultValue: DataTypes.NOW,
      },
      delivery_estimate: {
        type: DataTypes.STRING(100),
        allowNull: true,
      },
      items_count: {
        type: DataTypes.INTEGER,
        allowNull: true,
        defaultValue: 1,
      },
      current_status_name: {
        type: DataTypes.STRING(100),
        allowNull: true,
      },
      status_checked_at: {
        type: DataTypes.DATE,
        allowNull: true,
        defaultValue: DataTypes.NOW,
      },
      marketplace_order_number: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      rating: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      rating_feedback: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      rated_at: {
        type: DataTypes.DATE,
        allowNull: true,
      },
    },
    {
      tableName: 'orders',
      timestamps: false,
      underscored: true,
    },
  );

  model.associate = (models) => {
    model.belongsTo(models.PetOwner, {
      foreignKey: 'pet_owner_id',
      as: 'petOwner',
    });

    model.hasMany(models.OrderItem, {
      foreignKey: 'order_id',
      as: 'items',
    });
  };

  return model;
};

export default Order;
