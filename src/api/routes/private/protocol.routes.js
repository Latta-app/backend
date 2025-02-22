import { Router } from 'express';
import ProtocolController from '../../controllers/protocol.controller.js';
import { verifyToken, checkRole } from '../../middlewares/auth.middleware.js';

const router = Router();

router.post(
  '/',
  verifyToken,
  checkRole(['admin', 'superAdmin']),
  ProtocolController.createProtocol,
);

router.get(
  '/',
  verifyToken,
  checkRole(['admin', 'superAdmin', 'veterinary']),
  ProtocolController.getAllProtocols,
);

router.get(
  '/:id',
  verifyToken,
  checkRole(['admin', 'superAdmin', 'veterinary']),
  ProtocolController.getProtocolById,
);

router.get(
  '/clinic/:clinicId',
  verifyToken,
  checkRole(['admin', 'superAdmin', 'veterinary']),
  ProtocolController.getProtocolsByClinic,
);

router.get(
  '/pet-type/:petTypeId',
  verifyToken,
  checkRole(['admin', 'superAdmin', 'veterinary']),
  ProtocolController.getProtocolsByPetType,
);

router.put(
  '/:id',
  verifyToken,
  checkRole(['admin', 'superAdmin']),
  ProtocolController.updateProtocol,
);

router.delete(
  '/:id',
  verifyToken,
  checkRole(['admin', 'superAdmin']),
  ProtocolController.deleteProtocol,
);

export default router;
