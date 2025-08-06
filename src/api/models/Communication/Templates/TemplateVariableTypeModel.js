import { DataTypes } from 'sequelize';

const TemplateVariableTypeModel = (sequelize) => {
  const model = sequelize.define(
    'TemplateVariableType',
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
      description: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      created_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: sequelize.fn('NOW'),
      },
      n8n_formula: {
        type: DataTypes.STRING,
        allowNull: true,
      },
    },
    {
      tableName: 'template_variable_types',
      timestamps: false,
      underscored: true,
    },
  );

  model.associate = (models) => {
    if (models.TemplateVariable) {
      model.hasMany(models.TemplateVariable, {
        foreignKey: 'template_varible_type_id',
        as: 'templateVariables',
      });
    }
  };

  return model;
};

export default TemplateVariableTypeModel;
