import express from 'express';
import pg from 'pg';
import { getAuth } from 'firebase-admin/auth';
import { v5 as uuidv5 } from 'uuid';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;
const router = express.Router();
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// Namespace for converting Firebase UIDs to UUIDs (using a fixed UUID v4 as namespace)
const FIREBASE_NAMESPACE = '6ba7b810-9dad-11d1-80b4-00c04fd430c8';

// Convert Firebase UID to UUID v5
function convertFirebaseUIDtoUUID(firebaseUID) {
  return uuidv5(firebaseUID, FIREBASE_NAMESPACE);
}

const authenticateVet = async (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const decodedToken = await getAuth().verifyIdToken(token);
    if (decodedToken.role !== 'vet') throw new Error('Not a vet');
    req.user = decodedToken;
    next();
  } catch (error) {
    res.status(403).json({ error: 'Access denied' });
  }
};

router.post('/protocols', authenticateVet, async (req, res) => {
  const { vaccineName, species, initialDoseAge, boosterFrequency } = req.body;
  
  try {
    const result = await pool.query(
      `INSERT INTO protocols 
        (clinic_id, vaccine_name, species, initial_dose_age, booster_frequency) 
        VALUES ($1, $2, $3, $4, $5) 
        RETURNING *`,
      [convertFirebaseUIDtoUUID(req.user.uid), vaccineName, species, initialDoseAge, boosterFrequency]
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Database Error:', error);
    res.status(500).json({ error: error.message });
  }
});

router.get('/protocols', async (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const decodedToken = await getAuth().verifyIdToken(token);
    const userId = convertFirebaseUIDtoUUID(decodedToken.uid);

    let query = 'SELECT * FROM protocols';
    if (decodedToken.role === 'vet') {
      query += ' WHERE clinic_id = $1';
    }

    const result = await pool.query(query, decodedToken.role === 'vet' ? [userId] : []);
    res.json(result.rows);
  } catch (error) {
    console.error('Database Error:', error);
    res.status(500).json({ error: error.message });
  }
});

router.get('/protocols/:id', async (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const decodedToken = await getAuth().verifyIdToken(token);
    const userId = convertFirebaseUIDtoUUID(decodedToken.uid);
    const protocolId = req.params.id;

    let query;
    let params;

    if (decodedToken.role === 'vet') {
      query = 'SELECT id, vaccine_name FROM protocols WHERE id = $1 AND clinic_id = $2';
      params = [protocolId, userId];
    } else {
      query = 'SELECT id, vaccine_name FROM protocols WHERE id = $1';
      params = [protocolId];
    }

    const result = await pool.query(query, params);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Protocol not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Database Error:', error);
    res.status(500).json({ error: error.message });
  }
});

router.put('/protocols/:id', authenticateVet, async (req, res) => {
  const { id } = req.params;
  const { vaccineName, species, initialDoseAge, boosterFrequency } = req.body;
  
  try {
    const result = await pool.query(
      `UPDATE protocols SET
        vaccine_name = $1,
        species = $2,
        initial_dose_age = $3,
        booster_frequency = $4
      WHERE id = $5 AND clinic_id = $6
      RETURNING *`,
      [
        vaccineName,
        species,
        initialDoseAge,
        boosterFrequency,
        id,
        convertFirebaseUIDtoUUID(req.user.uid)
      ]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Protocol not found' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Database Error:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;