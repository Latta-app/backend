import { DataTypes } from 'sequelize';

const TemplateComponentTypeModel = (sequelize) => {
  const model = sequelize.define(
    'TemplateComponentType',
    {
      id: {
        type: DataTypes.UUID,
        primaryKey: true,
        defaultValue: DataTypes.UUIDV4,
      },
      type: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      created_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: sequelize.fn('NOW'),
      },
    },
    {
      tableName: 'template_component_types',
      timestamps: false,
      underscored: true,
    },
  );

  model.associate = (models) => {
    if (models.TemplateComponent) {
      model.hasMany(models.TemplateComponent, {
        foreignKey: 'template_component_type_id',
        as: 'templateComponents',
      });
    }

    if (models.TemplateVariable) {
      model.hasMany(models.TemplateVariable, {
        foreignKey: 'template_component_type_id',
        as: 'templateVariables',
      });
    }
  };

  return model;
};

export default TemplateComponentTypeModel;
