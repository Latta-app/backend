import { Router } from 'express';
import ClinicExternalController from '../../controllers/clinic-external.controller.js';
import { verifyToken, checkRole } from '../../middlewares/auth.middleware.js';
import { requireClinicPortalFlag } from '../../middlewares/clinic-portal-flag.middleware.js';

const router = Router();

router.use(verifyToken);
router.use(checkRole(['clinic', 'admin', 'superAdmin']));
router.use(requireClinicPortalFlag);

router.get('/external-pets', ClinicExternalController.listExternalPets);
router.post('/external-pets', ClinicExternalController.createExternalPet);
router.put('/external-pets/:id', ClinicExternalController.updateExternalPet);
router.delete('/external-pets/:id', ClinicExternalController.deleteExternalPet);

router.get('/external-contacts', ClinicExternalController.listExternalContacts);
router.post('/external-contacts', ClinicExternalController.createExternalContact);
router.put('/external-contacts/:id', ClinicExternalController.updateExternalContact);
router.delete('/external-contacts/:id', ClinicExternalController.deleteExternalContact);

export default router;
