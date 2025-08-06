import { DataTypes } from 'sequelize';

const TemplateVariableModel = (sequelize) => {
  const model = sequelize.define(
    'TemplateVariable',
    {
      id: {
        type: DataTypes.UUID,
        primaryKey: true,
        defaultValue: DataTypes.UUIDV4,
      },
      template_id: {
        type: DataTypes.UUID,
        allowNull: true,
        references: {
          model: 'templates',
          key: 'id',
        },
      },
      template_component_id: {
        type: DataTypes.UUID,
        allowNull: true,
        references: {
          model: 'template_components',
          key: 'id',
        },
      },
      template_component_type_id: {
        type: DataTypes.UUID,
        allowNull: true,
        references: {
          model: 'template_component_types',
          key: 'id',
        },
      },
      template_varible_type_id: {
        type: DataTypes.UUID,
        allowNull: true,
        references: {
          model: 'template_variable_types',
          key: 'id',
        },
      },
      variable_position: {
        type: DataTypes.BIGINT,
        allowNull: true,
      },
      created_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: sequelize.fn('NOW'),
      },
    },
    {
      tableName: 'template_variables',
      timestamps: false,
      underscored: true,
    },
  );

  model.associate = (models) => {
    // Associação com Template
    if (models.Template) {
      model.belongsTo(models.Template, {
        foreignKey: 'template_id',
        as: 'template',
      });
    }

    // Associação com TemplateComponent
    if (models.TemplateComponent) {
      model.belongsTo(models.TemplateComponent, {
        foreignKey: 'template_component_id',
        as: 'templateComponent',
      });
    }

    // Associação com TemplateComponentType
    if (models.TemplateComponentType) {
      model.belongsTo(models.TemplateComponentType, {
        foreignKey: 'template_component_type_id',
        as: 'templateComponentType',
      });
    }

    // Associação com TemplateVariableType
    if (models.TemplateVariableType) {
      model.belongsTo(models.TemplateVariableType, {
        foreignKey: 'template_varible_type_id',
        as: 'templateVariableType',
      });
    }
  };

  return model;
};

export default TemplateVariableModel;
