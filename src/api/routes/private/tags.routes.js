import { Router } from 'express';
import TagController from '../../controllers/tag.controller.js';
import { verifyToken, checkRole } from '../../middlewares/auth.middleware.js';

const router = Router();

router.get(
  '/',
  verifyToken,
  checkRole(['admin', 'superAdmin', 'attendant']),
  TagController.getAllTags,
);

router.get(
  '/search',
  verifyToken,
  checkRole(['admin', 'superAdmin', 'attendant']),
  TagController.searchTags,
);

router.get(
  '/:id',
  verifyToken,
  checkRole(['admin', 'superAdmin', 'attendant']),
  TagController.getTagById,
);

router.post('/', verifyToken, checkRole(['admin', 'superAdmin']), TagController.createTag);

router.put('/:id', verifyToken, checkRole(['admin', 'superAdmin']), TagController.updateTag);

router.delete('/:id', verifyToken, checkRole(['admin', 'superAdmin']), TagController.deleteTag);

export default router;
