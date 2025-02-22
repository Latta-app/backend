import { Router } from 'express';
import PetController from '../../controllers/pet.controller.js';
import { verifyToken, checkRole } from '../../middlewares/auth.middleware.js';

const router = Router();

router.get(
  '/options',
  verifyToken,
  checkRole(['admin', 'superAdmin', 'petOwner']),
  PetController.getPetOptions,
);

router.post(
  '/',
  verifyToken,
  checkRole(['admin', 'superAdmin', 'petOwner']),
  PetController.createPet,
);

router.get('/', verifyToken, checkRole(['admin', 'superAdmin']), PetController.getAllPets);

router.get(
  '/:id',
  verifyToken,
  checkRole(['admin', 'superAdmin', 'petOwner']),
  PetController.getPetById,
);

router.put(
  '/:id',
  verifyToken,
  checkRole(['admin', 'superAdmin', 'petOwner']),
  PetController.updatePet,
);

router.delete('/:id', verifyToken, checkRole(['admin', 'superAdmin']), PetController.deletePet);

export default router;
