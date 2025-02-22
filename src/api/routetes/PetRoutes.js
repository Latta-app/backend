import express from 'express';
import pg from 'pg';
import { getAuth } from 'firebase-admin/auth';
import dotenv from 'dotenv';
import { v5 as uuidv5 } from 'uuid';

dotenv.config();

const { Pool } = pg;
const router = express.Router();
// const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// Namespace for converting Firebase UIDs to UUIDs (using a fixed UUID v4 as namespace)
const FIREBASE_NAMESPACE = '6ba7b810-9dad-11d1-80b4-00c04fd430c8';

// Convert Firebase UID to UUID v5
function convertFirebaseUIDtoUUID(firebaseUID) {
  return uuidv5(firebaseUID, FIREBASE_NAMESPACE);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

// Add a test connection
pool
  .connect()
  .then(() => console.log('Connected to database successfully'))
  .catch((err) => console.error('Connection error:', err));

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

// Create a new pet
router.post('/pets', verifyToken, async (req, res) => {
  //   const { pool } = req.app.locals;
  const { name, pet_type_id, breed, dateOfBirth } = req.body;
  const tutorId = convertFirebaseUIDtoUUID(req.user.uid);

  try {
    const result = await pool.query(
      'INSERT INTO pets (pet_owner_id, name, pet_type_id, breed, date_of_birth) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [tutorId, name, pet_type_id, breed, dateOfBirth],
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error creating pet:', error);
    res.status(500).json({ error: 'Failed to create pet' });
  }
});

// Get all pets for a user
router.get('/pets', verifyToken, async (req, res) => {
  //   const { pool } = req.app.locals;
  const userId = convertFirebaseUIDtoUUID(req.user.uid);
  const userRole = req.user.role;

  try {
    let query;
    let params;

    if (userRole === 'vet') {
      // Vets can see all pets in their clinic
      query = `
        SELECT p.* 
        FROM pets p
        JOIN users u ON p.pet_owner_id = u.id
        WHERE u.clinic_id = (SELECT clinic_id FROM users WHERE id = $1)
      `;
      params = [userId];
    } else {
      // Tutors can only see their own pets
      query = 'SELECT * FROM pets WHERE pet_owner_id = $1';
      params = [userId];
    }

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching pets:', error);
    res.status(500).json({ error: 'Failed to fetch pets' });
  }
});

router.put('/pets/:id', verifyToken, async (req, res) => {
  const { id: petId } = req.params;
  const { name, pet_type_id, breed, dateOfBirth } = req.body;
  const userId = convertFirebaseUIDtoUUID(req.user.uid);
  const userRole = req.user.role;

  try {
    let query;
    let params;

    if (userRole === 'tutor') {
      query = `
        UPDATE pets 
        SET name = $1, pet_type_id = $2, breed = $3, date_of_birth = $4 
        WHERE id = $5 AND pet_owner_id = $6 
        RETURNING *
      `;
      params = [name, pet_type_id, breed, dateOfBirth, petId, userId];
    } else if (userRole === 'vet') {
      query = `
        UPDATE pets 
        SET name = $1, pet_type_id = $2, breed = $3, date_of_birth = $4 
        FROM users 
        WHERE pets.id = $5 
          AND pets.pet_owner_id = users.id 
          AND users.clinic_id = (SELECT clinic_id FROM users WHERE id = $6)
        RETURNING pets.*
      `;
      params = [name, pet_type_id, breed, dateOfBirth, petId, userId];
    } else {
      return res.status(403).json({ error: 'Unauthorized role' });
    }

    const result = await pool.query(query, params);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Pet not found or unauthorized' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating pet:', error);
    res.status(500).json({ error: 'Failed to update pet' });
  }
});

export default router;
