import { Router } from 'express';
import SchedulingController from '../../controllers/scheduling.controller.js';
import { verifyToken, checkRole } from '../../middlewares/auth.middleware.js';

const router = Router();

// Criar um novo agendamento
router.post(
  '/',
  verifyToken,
  checkRole(['admin', 'superAdmin', 'petOwner', 'clinic']),
  SchedulingController.createScheduling,
);

// Obter todos os agendamentos
router.get(
  '/',
  verifyToken,
  checkRole(['admin', 'superAdmin', 'clinic']),
  SchedulingController.getAllSchedulings,
);

// Obter agendamentos por clínica
router.get(
  '/clinic/:clinicId',
  verifyToken,
  checkRole(['admin', 'superAdmin', 'clinic']),
  SchedulingController.getSchedulingsByClinic,
);

// Obter agendamentos por dono de pet
router.get(
  '/pet-owner/:petOwnerId',
  verifyToken,
  checkRole(['admin', 'superAdmin', 'petOwner', 'clinic']),
  SchedulingController.getSchedulingsByPetOwner,
);

// Obter agendamentos por pet
router.get(
  '/pet/:petId',
  verifyToken,
  checkRole(['admin', 'superAdmin', 'petOwner', 'clinic']),
  SchedulingController.getSchedulingsByPet,
);

// Obter um agendamento específico pelo ID
router.get(
  '/:id',
  verifyToken,
  checkRole(['admin', 'superAdmin', 'petOwner', 'clinic']),
  SchedulingController.getSchedulingById,
);

// Atualizar um agendamento
router.put(
  '/:id',
  verifyToken,
  checkRole(['admin', 'superAdmin', 'clinic']),
  SchedulingController.updateScheduling,
);

// Cancelar um agendamento
router.patch(
  '/:id/cancel',
  verifyToken,
  checkRole(['admin', 'superAdmin', 'petOwner', 'clinic']),
  SchedulingController.cancelScheduling,
);

// Marcar no-show (tutor nao compareceu)
router.patch(
  '/:id/no-show',
  verifyToken,
  checkRole(['admin', 'superAdmin', 'clinic']),
  SchedulingController.noShowScheduling,
);

// Remarcar agendamento
router.patch(
  '/:id/reschedule',
  verifyToken,
  checkRole(['admin', 'superAdmin', 'clinic']),
  SchedulingController.rescheduleScheduling,
);

// Confirmar um agendamento
router.patch(
  '/:id/confirm',
  verifyToken,
  checkRole(['admin', 'superAdmin', 'clinic']),
  SchedulingController.confirmScheduling,
);

// Remover um agendamento
router.delete(
  '/:id',
  verifyToken,
  checkRole(['admin', 'superAdmin', 'clinic']),
  SchedulingController.deleteScheduling,
);

export default router;
