import { DataTypes } from 'sequelize';

const TemplateParameterTypeModel = (sequelize) => {
  const model = sequelize.define(
    'TemplateParameterType',
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
      tableName: 'template_parameter_types',
      timestamps: false,
      underscored: true,
    },
  );

  model.associate = (models) => {
    if (models.TemplateComponent) {
      model.hasMany(models.TemplateComponent, {
        foreignKey: 'template_parameter_type_id',
        as: 'templateComponents',
      });
    }
  };

  return model;
};

export default TemplateParameterTypeModel;
