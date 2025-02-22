import { DataTypes } from 'sequelize';

const Vaccine = (sequelize) => {
  const model = sequelize.define('Vaccine', {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4,
    },
    pet_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'pets',
        key: 'id',
      },
    },
    protocol_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'protocols',
        key: 'id',
      },
    },
    name: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    date_administered: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    next_due_date: {
      type: DataTypes.DATE,
      allowNull: false,
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
    tableName: 'vaccines',
    timestamps: false,
    underscored: true,
  });

  model.associate = (models) => {
    model.belongsTo(models.Pet, {
      foreignKey: 'pet_id',
      as: 'pet'
    });
    model.belongsTo(models.Protocol, {
      foreignKey: 'protocol_id',
      as: 'protocol'
    });
  };

  return model;
};

export default Vaccine;
