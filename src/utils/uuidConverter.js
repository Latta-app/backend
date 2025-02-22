import { v5 as uuidv5 } from 'uuid';

const FIREBASE_NAMESPACE = '6ba7b810-9dad-11d1-80b4-00c04fd430c8';

export const convertFirebaseUIDtoUUID = (firebaseUID) => {
  if (!firebaseUID || typeof firebaseUID !== 'string') {
    throw new Error('Invalid Firebase UID');
  }
  return uuidv5(firebaseUID, FIREBASE_NAMESPACE);
};
