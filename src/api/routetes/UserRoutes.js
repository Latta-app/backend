import express from 'express';
import pg from 'pg';
import { getAuth } from 'firebase-admin/auth';
import dotenv from 'dotenv';
import { v5 as uuidv5 } from 'uuid';
// import { pool } from '../../config/database.js';

dotenv.config();

const router = express.Router();
// const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const authenticateToken = async (req, res, next) => {

  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const decodedToken = await getAuth().verifyIdToken(token);
    req.user = decodedToken;
    next();
  } catch (error) {
    res.status(403).json({ error: 'Invalid token' });
  }
};

router.post('/create', authenticateToken, async (req, res) => {
  const { email, role } = req.body;
  
  try {
    if (req.user.email !== email) {
      return res.status(403).json({ error: 'Email mismatch' });
    }

    // Convert Firebase UID to UUID
    const uuid = convertFirebaseUIDtoUUID(req.user.uid);

    // Set clinic_id based on role
    const clinic_id = role === 'vet' ? uuid : null;

    // Validate vet email domain
    if (role === 'vet' && !email.endsWith('@petclinic.com')) {
      return res.status(400).json({ error: 'Veterinarians must use @petclinic.com email' });
    }

    // For veterinarians, create a clinic first
    if (role === 'vet') {
      await pool.query(
        'INSERT INTO clinics (id, name) VALUES ($1, $2)',
        [uuid, `${email.split('@')[0]}'s Clinic`]
      );
    }

    const result = await pool.query(
      `INSERT INTO users (id, email, role, clinic_id, password) 
       VALUES ($1, $2, $3, $4, 'firebase_auth') 
       RETURNING *`,
      [uuid, email, role, clinic_id]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Database Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Namespace for converting Firebase UIDs to UUIDs (using a fixed UUID v4 as namespace)
const FIREBASE_NAMESPACE = '6ba7b810-9dad-11d1-80b4-00c04fd430c8';

// Convert Firebase UID to UUID v5
function convertFirebaseUIDtoUUID(firebaseUID) {
  return uuidv5(firebaseUID, FIREBASE_NAMESPACE);
}

// Update the route handler to use the conversion
router.get('/me', async (req, res) => {
  try {
    const firebaseUID = req.user.uid;
    const uuid = convertFirebaseUIDtoUUID(firebaseUID);
    
    const result = await pool.query(
      'SELECT * FROM users WHERE id = $1',
      [uuid]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Database Error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

export default router;