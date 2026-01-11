import { DataTypes } from 'sequelize';

const Contact = (sequelize) => {
  const model = sequelize.define(
    'Contact',
    {
      id: {
        type: DataTypes.UUID,
        primaryKey: true,
        defaultValue: DataTypes.UUIDV4,
      },
      profile_name: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      clinic_id: {
        type: DataTypes.UUID,
        allowNull: true,
      },
      created_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },
      updated_at: {
        type: DataTypes.DATE,
        allowNull: true,
        defaultValue: DataTypes.NOW,
      },
      deleted_at: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      pet_owner_id: {
        type: DataTypes.UUID,
        allowNull: true,
      },
      cellphone: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      is_being_attended: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
    },
    {
      tableName: 'contacts',
      timestamps: false,
      underscored: true,
    },
  );

  model.associate = (models) => {
    model.belongsTo(models.Clinic, {
      foreignKey: 'clinic_id',
      as: 'clinic',
    });

    model.belongsTo(models.PetOwner, {
      foreignKey: 'pet_owner_id',
      as: 'petOwner',
    });

    model.hasMany(models.ChatHistory, {
      foreignKey: 'contact_id',
      as: 'chatHistory',
    });
  };

  return model;
};

export default Contact;
