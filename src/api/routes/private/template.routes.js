import { Router } from 'express';
import TemplateController from '../../controllers/template.controller.js';
import { verifyToken, checkRole } from '../../middlewares/auth.middleware.js';

const router = Router();

router.get(
  '/',
  verifyToken,
  checkRole(['admin', 'superAdmin', 'attendant']),
  TemplateController.getAllTemplates,
);

router.get(
  '/search',
  verifyToken,
  checkRole(['admin', 'superAdmin', 'attendant']),
  TemplateController.searchTemplates,
);

router.get(
  '/:id',
  verifyToken,
  checkRole(['admin', 'superAdmin', 'attendant']),
  TemplateController.getTemplateById,
);

export default router;
