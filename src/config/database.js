import { Sequelize } from 'sequelize';
import dotenv from 'dotenv';

dotenv.config();

export const sequelize = new Sequelize(process.env.DATABASE_URL, {
  dialectOptions: {
    ssl: {
      require: true,
      rejectUnauthorized: false
    }
  }
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
