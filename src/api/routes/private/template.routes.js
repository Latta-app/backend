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

// ANTES do `/:id`: Express casa na ordem de declaração, e um `/catalog`
// declarado depois cairia no parâmetro, buscando um template de id "catalog".
router.get(
  '/catalog',
  verifyToken,
  checkRole(['admin', 'superAdmin', 'attendant']),
  TemplateController.getTemplateCatalog,
);

router.get(
  '/:id',
  verifyToken,
  checkRole(['admin', 'superAdmin', 'attendant']),
  TemplateController.getTemplateById,
);

export default router;
