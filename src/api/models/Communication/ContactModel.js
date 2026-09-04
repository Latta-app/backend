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
      // O selo da saída do titular (LGPD Art. 18, fatia S-03 da aposentadoria
      // da v1): o pedido de exclusão RETÉM em vez de apagar, e a mensageria
      // continua mostrando nome e histórico com "pediu exclusão em <data>".
      //
      // 🚨 Sem esta declaração a coluna existe no banco e NÃO chega em tela
      // nenhuma. O Sequelize monta o SELECT coluna a coluna a partir do model,
      // e nenhum dos builders da mensageria passa `attributes` no Contact —
      // eles herdam esta lista. Era esse o estado até 04/09/2026: carimbo
      // gravado em prod, e o operador vendo o titular selado igual a qualquer
      // outro.
      //
      // 🚨 NÃO é `deleted_at`. Aquele é o degrau DESATIVAR, reversível, e o
      // `reativarTitular` o zera no primeiro inbound do tutor. Este é
      // irreversível por decisão, e é ele que comanda a barreira de outbound.
      deletion_requested_at: {
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
