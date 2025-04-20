import { Router } from 'express';
import SchedulingController from '../../controllers/scheduling.controller.js';
import { verifyToken, checkRole } from '../../middlewares/auth.middleware.js';

const router = Router();

// Criar um novo agendamento
router.post(
  '/',
  verifyToken,
  checkRole(['admin', 'superAdmin', 'petOwner']),
  SchedulingController.createScheduling,
);

// Obter todos os agendamentos
router.get(
  '/',
  verifyToken,
  checkRole(['admin', 'superAdmin']),
  SchedulingController.getAllSchedulings,
);

// Obter agendamentos por clínica
router.get(
  '/clinic/:clinicId',
  verifyToken,
  checkRole(['admin', 'superAdmin']),
  SchedulingController.getSchedulingsByClinic,
);

// Obter agendamentos por dono de pet
router.get(
  '/pet-owner/:petOwnerId',
  verifyToken,
  checkRole(['admin', 'superAdmin', 'petOwner']),
  SchedulingController.getSchedulingsByPetOwner,
);

// Obter agendamentos por pet
router.get(
  '/pet/:petId',
  verifyToken,
  checkRole(['admin', 'superAdmin', 'petOwner']),
  SchedulingController.getSchedulingsByPet,
);

// Obter um agendamento específico pelo ID
router.get(
  '/:id',
  verifyToken,
  checkRole(['admin', 'superAdmin', 'petOwner']),
  SchedulingController.getSchedulingById,
);

// Atualizar um agendamento
router.put(
  '/:id',
  verifyToken,
  checkRole(['admin', 'superAdmin']),
  SchedulingController.updateScheduling,
);

// Cancelar um agendamento
router.patch(
  '/:id/cancel',
  verifyToken,
  checkRole(['admin', 'superAdmin', 'petOwner']),
  SchedulingController.cancelScheduling,
);

// Confirmar um agendamento
router.patch(
  '/:id/confirm',
  verifyToken,
  checkRole(['admin', 'superAdmin']),
  SchedulingController.confirmScheduling,
);

// Remover um agendamento
router.delete(
  '/:id',
  verifyToken,
  checkRole(['admin', 'superAdmin']),
  SchedulingController.deleteScheduling,
);

export default router;
