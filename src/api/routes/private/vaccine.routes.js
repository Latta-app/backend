import { Router } from 'express';
import VaccineController from '../../controllers/vaccine.controller.js';
import { verifyToken, checkRole } from '../../middlewares/auth.middleware.js';

const router = Router();

router.post(
  '/',
  verifyToken,
  checkRole(['admin', 'superAdmin', 'veterinary']),
  VaccineController.createVaccine
);

router.get(
  '/',
  verifyToken,
  checkRole(['admin', 'superAdmin']),
  VaccineController.getAllVaccines
);

router.get(
  '/:id',
  verifyToken,
  checkRole(['admin', 'superAdmin', 'veterinary', 'petOwner']),
  VaccineController.getVaccineById
);


router.get(
  '/pet/:petId',
  verifyToken,
  checkRole(['admin', 'superAdmin', 'veterinary', 'petOwner']),
  VaccineController.getVaccinesByPetId
);


router.put(
  '/:id',
  verifyToken,
  checkRole(['admin', 'superAdmin', 'veterinary']),
  VaccineController.updateVaccine
);


router.delete(
  '/:id',
  verifyToken,
  checkRole(['admin', 'superAdmin']),
  VaccineController.deleteVaccine
);

export default router;
