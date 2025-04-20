import { DataTypes } from 'sequelize';

const PetBloodType = (sequelize) => {
  const model = sequelize.define(
    'PetBloodType',
    {
      id: {
        type: DataTypes.UUID,
        primaryKey: true,
        defaultValue: DataTypes.UUIDV4,
      },
      pet_type_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: {
          model: 'pet_types',
          key: 'id',
        },
      },
      name: {
        type: DataTypes.STRING(255),
        allowNull: false,
      },
      label: {
        type: DataTypes.STRING(255),
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
    },
    {
      tableName: 'pet_blood_types',
      timestamps: false,
      underscored: true,
      indexes: [
        {
          unique: true,
          fields: ['pet_type_id', 'name'],
        },
      ],
    },
  );

  model.associate = (models) => {
    model.belongsTo(models.PetType, {
      foreignKey: 'pet_type_id',
      as: 'type',
    });

    model.hasMany(models.Pet, {
      foreignKey: 'pet_blood_type_id',
      as: 'pets',
    });
  };

  return model;
};

export default PetBloodType;
