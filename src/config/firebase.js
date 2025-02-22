import { initializeApp, cert } from 'firebase-admin/app';

const initializeFirebase = () => {
  try {
    initializeApp({
      credential: cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
      }),
    });

    console.log('✅ Firebase inicializado com sucesso.');
  } catch (error) {
    console.error('❌ Falha ao inicializar Firebase:', error);
    process.exit(1);
  }
};

export default initializeFirebase;
