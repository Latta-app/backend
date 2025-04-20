import { Router } from 'express';
import ServiceTypeController from '../../controllers/service-type.controller.js';
import { verifyToken, checkRole } from '../../middlewares/auth.middleware.js';

const router = Router();

router.post(
  '/',
  verifyToken,
  checkRole(['admin', 'superAdmin']),
  ServiceTypeController.createServiceType,
);

router.get(
  '/',
  verifyToken,
  checkRole(['admin', 'superAdmin', 'petOwner']),
  ServiceTypeController.getAllServiceTypes,
);

router.get(
  '/:id',
  verifyToken,
  checkRole(['admin', 'superAdmin', 'petOwner']),
  ServiceTypeController.getServiceTypeById,
);

router.put(
  '/:id',
  verifyToken,
  checkRole(['admin', 'superAdmin']),
  ServiceTypeController.updateServiceType,
);

router.delete(
  '/:id',
  verifyToken,
  checkRole(['admin', 'superAdmin']),
  ServiceTypeController.deleteServiceType,
);

export default router;
