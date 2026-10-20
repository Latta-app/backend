import { Router } from 'express';
import UserController from '../../controllers/user.controller.js';
import { verifyToken, checkRole } from '../../middlewares/auth.middleware.js';

const router = Router();

// Criar usuario NUNCA e rota aberta: sem login, qualquer pessoa criava um admin.
// Nenhum cliente conhecido (frontend, funcoes de borda, n8n do repositorio)
// chama estas quatro rotas sem token; so admin e superAdmin criam usuarios.
const soAdmin = [verifyToken, checkRole(['admin', 'superAdmin'])];
router.post('/create-admin', ...soAdmin, UserController.createAdmin);
router.post('/create-veterinary', ...soAdmin, UserController.createVeterinary);
router.post('/create-pet-owner', ...soAdmin, UserController.createPetOwner);
router.post('/create-user', ...soAdmin, UserController.createUser);

router.get(
  '/veterinaries',
  verifyToken,
  checkRole(['admin', 'superAdmin']),
  UserController.getAllVeterinaries,
);

router.get(
  '/veterinary/:id',
  verifyToken,
  checkRole(['admin', 'superAdmin']),
  UserController.getVeterinaryById,
);

router.get(
  '/pet-owners',
  verifyToken,
  checkRole(['admin', 'superAdmin']),
  UserController.getAllPetOwners,
);

router.get(
  '/pet-owner/:id',
  verifyToken,
  checkRole(['admin', 'superAdmin']),
  UserController.getPetOwnerById,
);

router.get(
  '/bathers',
  verifyToken,
  checkRole(['admin', 'superAdmin']),
  UserController.getAllBathers,
);

router.get(
  '/attendants',
  verifyToken,
  checkRole(['admin', 'superAdmin', 'attendant']),
  UserController.getAllAttendants,
);

router.get(
  '/:email',
  verifyToken,
  checkRole(['admin', 'superAdmin']),
  UserController.getUserByEmail,
);

router.get('/', verifyToken, checkRole(['admin', 'superAdmin']), UserController.getAllUsers);

export default router;
