import express from 'express';
import pg from 'pg';
import { getAuth } from 'firebase-admin/auth';
import dotenv from 'dotenv';
import { v5 as uuidv5 } from 'uuid';

dotenv.config();

const { Pool } = pg;
const router = express.Router();

// Namespace for converting Firebase UIDs to UUIDs (using a fixed UUID v4 as namespace)
const FIREBASE_NAMESPACE = '6ba7b810-9dad-11d1-80b4-00c04fd430c8';

// Convert Firebase UID to UUID v5
function convertFirebaseUIDtoUUID(firebaseUID) {
  return uuidv5(firebaseUID, FIREBASE_NAMESPACE);
}

const pool = new Pool({ 
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// Add a test connection
pool.connect()
  .then(() => console.log('Connected to database successfully'))
  .catch(err => console.error('Connection error:', err));

// Middleware to verify Firebase token
const verifyToken = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split('Bearer ')[1];
    if (!token) throw new Error('No token provided');
    
    const decodedToken = await getAuth().verifyIdToken(token);
    req.user = decodedToken;
    next();
  } catch (error) {
    res.status(401).json({ error: 'Unauthorized' });
  }
};

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

  router.post('/pets/:petId/vaccines', authenticateVet, async (req, res) => {
    const { petId } = req.params;
    const { name, date_administered, next_due_date, protocol_id } = req.body;
    
    try {
      // First verify that the pet exists
      const pet = await pool.query(
        'SELECT * FROM pets WHERE id = $1',
        [petId] // Only one parameter here
      );
  
      if (pet.rows.length === 0) {
        return res.status(404).json({ error: 'Pet not found' });
      }
  
      const result = await pool.query(
        `INSERT INTO vaccines (
          pet_id,
          protocol_id,
          name,
          date_administered,
          next_due_date
        ) VALUES ($1, $2, $3, $4, $5)
        RETURNING *`,
        [
          petId,
          protocol_id,
          name,
          date_administered,
          next_due_date
        ] // Five parameters matching the VALUES placeholders
      );
  
      res.status(201).json(result.rows[0]);
    } catch (error) {
      console.error('Database Error:', error);
      res.status(500).json({ error: error.message });
    }
  });
  

// Get all vaccines for a pet
router.get('/pets/:petId/vaccines', verifyToken, async (req, res) => {
    const { petId } = req.params;
    // Validate that petId exists and is a valid UUID
    if (!petId) {
      return res.status(400).json({ error: 'Pet ID is required' });
    }
  
    try {
      // First check if pet exists
      const petCheck = await pool.query(
        'SELECT * FROM pets WHERE id = $1::uuid',
        [petId]
      );
  
      if (petCheck.rows.length === 0) {
        return res.status(404).json({ error: 'Pet not found' });
      }
  
      // Get vaccines with protocol information
      const vaccines = await pool.query(
        `SELECT 
          v.*,
          p.vaccine_name as protocol_name
         FROM vaccines v
         LEFT JOIN protocols p ON v.protocol_id = p.id
         WHERE v.pet_id = $1::uuid
         ORDER BY v.date_administered DESC`,
        [petId]
      );
  
      res.json(vaccines.rows);
    } catch (error) {
      // If error is invalid UUID format
      if (error.code === '22P02') {
        return res.status(400).json({ error: 'Invalid pet ID format' });
      }
      
      console.error('Error fetching vaccines:', error);
      res.status(500).json({ error: error.message });
    }
  });

export default router;