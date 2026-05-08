import { Router } from 'express';
import TemplateCreateController from '../../controllers/template-create.controller.js';
import { verifyToken, checkRole } from '../../middlewares/auth.middleware.js';

const router = Router();

// LLM-assisted template authoring — operadora descreve o que quer e o
// backend propoe estrutura. Frontend apresenta + permite edicao antes
// do submit final.
router.post(
  '/draft',
  verifyToken,
  checkRole(['admin', 'superAdmin', 'attendant']),
  TemplateCreateController.draft,
);

// Submete o draft (eventualmente editado) pra Meta API + grava DB com
// status PENDING. Aprovacao acontece async (24-72h pela Meta).
router.post(
  '/submit',
  verifyToken,
  checkRole(['admin', 'superAdmin', 'attendant']),
  TemplateCreateController.submit,
);

export default router;
