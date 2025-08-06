import { DataTypes } from 'sequelize';

const TemplateComponentModel = (sequelize) => {
  const model = sequelize.define(
    'TemplateComponent',
    {
      id: {
        type: DataTypes.UUID,
        primaryKey: true,
        defaultValue: DataTypes.UUIDV4,
      },
      clinic_id: {
        type: DataTypes.UUID,
        allowNull: true,
        references: {
          model: 'clinics',
          key: 'id',
        },
      },
      template_id: {
        type: DataTypes.UUID,
        allowNull: true,
        references: {
          model: 'templates',
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
      template_parameter_type_id: {
        type: DataTypes.UUID,
        allowNull: true,
        references: {
          model: 'template_parameter_types',
          key: 'id',
        },
      },
      media_name: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      media_key: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      phone_number: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      url: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      text: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      position: {
        type: DataTypes.BIGINT,
        allowNull: true,
      },
      created_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: sequelize.fn('NOW'),
      },
      payload: {
        type: DataTypes.STRING,
        allowNull: true,
      },
    },
    {
      tableName: 'template_components',
      timestamps: false,
      underscored: true,
    },
  );

  model.associate = (models) => {
    // Associação com Clinic
    if (models.Clinic) {
      model.belongsTo(models.Clinic, {
        foreignKey: 'clinic_id',
        as: 'clinic',
      });
    }

    // Associação com Template
    if (models.Template) {
      model.belongsTo(models.Template, {
        foreignKey: 'template_id',
        as: 'template',
      });
    }

    // Associação com TemplateComponentType
    if (models.TemplateComponentType) {
      model.belongsTo(models.TemplateComponentType, {
        foreignKey: 'template_component_type_id',
        as: 'componentType',
      });
    }

    // Associação com TemplateParameterType
    if (models.TemplateParameterType) {
      model.belongsTo(models.TemplateParameterType, {
        foreignKey: 'template_parameter_type_id',
        as: 'parameterType',
      });
    }

    // Associação com TemplateVariable
    if (models.TemplateVariable) {
      model.hasMany(models.TemplateVariable, {
        foreignKey: 'template_component_id',
        as: 'variables',
      });
    }
  };

  return model;
};

export default TemplateComponentModel;
