import express from 'express';
import { getAuth } from 'firebase-admin/auth';

const router = express.Router();

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

router.post('/create-vet', authenticateToken, async (req, res) => {
  const { role } = req.body;
  try {
    // Validate role
    // if (!['vet', 'tutor'].includes(role)) {
    //   return res.status(400).json({ error: 'Invalid role' });
    // }

    // // For vet role, verify email domain
    // if (role === 'vet' && !req.user.email.endsWith('@petclinic.com')) {
    //   return res.status(403).json({ error: 'Only @petclinic.com emails can be veterinarians' });
    // }

    // // Set the custom claim
    // await getAuth().setCustomUserClaims(req.user.uid, { role });

    res.json({ message: 'Role set successfully' });
  } catch (error) {
    console.error('Error setting custom claims:', error);
    res.status(500).json({ error: 'Failed to set role' });
  }
});

export default router;