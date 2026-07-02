import { Router } from 'express';
import SchedulingController from '../../controllers/scheduling.controller.js';
import { verifyToken, checkRole } from '../../middlewares/auth.middleware.js';
import { requireClinicPortalFlag } from '../../middlewares/clinic-portal-flag.middleware.js';

const router = Router();

// Role 'clinic' só entra em rotas cujo controller tem guard de clinic_id +
// redaction. Rotas sem scoping por clínica (lista geral, por-pet, por-tutor,
// update/confirm/delete genéricos) vazariam phone/email de tutores de outras
// clínicas — ficam admin-only. requireClinicPortalFlag: gate server-side do
// beta clinic_portal_v0 (no-op pra admin/superAdmin/petOwner).

// Criar um novo agendamento (role clinic: controller força clinic_id do JWT)
router.post(
  '/',
  verifyToken,
  checkRole(['admin', 'superAdmin', 'petOwner', 'clinic']),
  requireClinicPortalFlag,
  SchedulingController.createScheduling,
);

// Obter todos os agendamentos (lista geral, sem scoping — admin-only)
router.get(
  '/',
  verifyToken,
  checkRole(['admin', 'superAdmin']),
  SchedulingController.getAllSchedulings,
);

// Obter agendamentos por clínica (controller tem anti-bypass + redaction)
router.get(
  '/clinic/:clinicId',
  verifyToken,
  checkRole(['admin', 'superAdmin', 'clinic']),
  requireClinicPortalFlag,
  SchedulingController.getSchedulingsByClinic,
);

// Obter agendamentos por dono de pet (sem scoping por clínica — clinic fora)
router.get(
  '/pet-owner/:petOwnerId',
  verifyToken,
  checkRole(['admin', 'superAdmin', 'petOwner']),
  SchedulingController.getSchedulingsByPetOwner,
);

// Obter agendamentos por pet (sem scoping por clínica — clinic fora)
router.get(
  '/pet/:petId',
  verifyToken,
  checkRole(['admin', 'superAdmin', 'petOwner']),
  SchedulingController.getSchedulingsByPet,
);

// Obter um agendamento específico pelo ID (controller tem guard + redaction)
router.get(
  '/:id',
  verifyToken,
  checkRole(['admin', 'superAdmin', 'petOwner', 'clinic']),
  requireClinicPortalFlag,
  SchedulingController.getSchedulingById,
);

// Atualizar um agendamento (edição genérica sem guard de ownership — admin-only)
router.put(
  '/:id',
  verifyToken,
  checkRole(['admin', 'superAdmin']),
  SchedulingController.updateScheduling,
);

// Cancelar um agendamento (controller tem guard de ownership pra clinic)
router.patch(
  '/:id/cancel',
  verifyToken,
  checkRole(['admin', 'superAdmin', 'petOwner', 'clinic']),
  requireClinicPortalFlag,
  SchedulingController.cancelScheduling,
);

// Marcar no-show (controller tem guard de ownership pra clinic)
router.patch(
  '/:id/no-show',
  verifyToken,
  checkRole(['admin', 'superAdmin', 'clinic']),
  requireClinicPortalFlag,
  SchedulingController.noShowScheduling,
);

// Remarcar agendamento (controller tem guard de ownership pra clinic)
router.patch(
  '/:id/reschedule',
  verifyToken,
  checkRole(['admin', 'superAdmin', 'clinic']),
  requireClinicPortalFlag,
  SchedulingController.rescheduleScheduling,
);

// Confirmar um agendamento (sem guard de ownership — admin-only)
router.patch(
  '/:id/confirm',
  verifyToken,
  checkRole(['admin', 'superAdmin']),
  SchedulingController.confirmScheduling,
);

// Remover um agendamento (hard delete — admin-only)
router.delete(
  '/:id',
  verifyToken,
  checkRole(['admin', 'superAdmin']),
  SchedulingController.deleteScheduling,
);

export default router;
