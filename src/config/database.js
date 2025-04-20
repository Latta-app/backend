import { Sequelize } from 'sequelize';
import dotenv from 'dotenv';
import pg from 'pg';

dotenv.config();

export const sequelize = new Sequelize(process.env.DATABASE_URL, {
  dialect: 'postgres',
  dialectModule: pg,
  dialectOptions: {
    ssl: {
      require: true,
      rejectUnauthorized: false,
    },
    family: 4,
  },
  useUTC: false,
  timezone: '-03:00',
});

export const checkDatabaseConnection = async () => {
  try {
    await sequelize.authenticate();
    console.log('✅ Conexão com o banco estabelecida');
    // await sequelize.sync({ force: false, alter: false });
    console.log('✅ Modelos sincronizados');
  } catch (error) {
    console.error('❌ Falha na conexão com o banco:', error);
    process.exit(1);
  }
};
