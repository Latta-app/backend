import { DataTypes } from 'sequelize';

const TemplateModel = (sequelize) => {
  const model = sequelize.define(
    'Template',
    {
      id: {
        type: DataTypes.UUID,
        primaryKey: true,
        defaultValue: DataTypes.UUIDV4,
      },
      created_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: sequelize.fn('NOW'),
      },
      template_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
        unique: true,
      },
      template_name: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      template_language: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      template_status: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      template_preview: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      template_category: {
        type: DataTypes.STRING,
        allowNull: true,
      },
    },
    {
      tableName: 'templates',
      timestamps: false,
      underscored: true,
    },
  );

  model.associate = (models) => {
    if (models.TemplateComponent) {
      model.hasMany(models.TemplateComponent, {
        foreignKey: 'template_id',
        as: 'components',
      });
    }

    if (models.TemplateVariable) {
      model.hasMany(models.TemplateVariable, {
        foreignKey: 'template_id',
        as: 'variables',
      });
    }
  };

  return model;
};

export default TemplateModel;
