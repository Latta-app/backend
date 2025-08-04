import { Router } from 'express';
import UserController from '../../controllers/user.controller.js';
import { verifyToken, checkRole } from '../../middlewares/auth.middleware.js';

const router = Router();

router.post('/create-admin', UserController.createAdmin);
router.post('/create-veterinary', UserController.createVeterinary);
router.post('/create-pet-owner', UserController.createPetOwner);
router.post('/create-user', UserController.createUser);

router.get(
  '/veterinaries',
  verifyToken,
  checkRole(['admin', 'superAdmin']),
  UserController.getAllVeterinaries,
);

router.get(
  '/veterinary/:id',
  verifyToken,
  checkRole(['admin', 'superAdmin']),
  UserController.getVeterinaryById,
);

router.get(
  '/pet-owners',
  verifyToken,
  checkRole(['admin', 'superAdmin']),
  UserController.getAllPetOwners,
);

router.get(
  '/pet-owner/:id',
  verifyToken,
  checkRole(['admin', 'superAdmin']),
  UserController.getPetOwnerById,
);

router.get(
  '/bathers',
  verifyToken,
  checkRole(['admin', 'superAdmin']),
  UserController.getAllBathers,
);

router.get(
  '/attendants',
  verifyToken,
  checkRole(['admin', 'superAdmin', 'attendant']),
  UserController.getAllAttendants,
);

router.get(
  '/:email',
  verifyToken,
  checkRole(['admin', 'superAdmin']),
  UserController.getUserByEmail,
);

router.get('/', verifyToken, checkRole(['admin', 'superAdmin']), UserController.getAllUsers);

export default router;
