import { Router } from 'express';
import PetOwnerController from '../../controllers/pet-owner.controller.js';
import { verifyToken, checkRole } from '../../middlewares/auth.middleware.js';

const router = Router();

// /pet-owner é superfície Latta (painel admin interno) — o repo devolve o
// registro COMPLETO e NÃO redacted (name, email, cell_phone, cpf, rg,
// date_of_birth, address_*, emergency_contact_*). Role 'clinic' NUNCA pode
// entrar aqui: um token de clínica passa no verifyToken e leria/mutaria PII de
// tutor em claro, furando o appointment-redactor. Clientes próprios da clínica
// vivem em external_contacts via /clinic/external-* (rota corretamente guardada).
// Convenção alinhada com as rotas irmãs /pet e /users (['admin','superAdmin']).
const ADMIN_ONLY = checkRole(['admin', 'superAdmin']);

router.post('/', verifyToken, ADMIN_ONLY, PetOwnerController.createPetOwner);

router.get('/', verifyToken, ADMIN_ONLY, PetOwnerController.getAllPetOwners);

router.get('/:id', verifyToken, ADMIN_ONLY, PetOwnerController.getPetOwnerById);

router.put('/:id', verifyToken, ADMIN_ONLY, PetOwnerController.updatePetOwner);

router.delete('/:id', verifyToken, ADMIN_ONLY, PetOwnerController.deletePetOwner);

router.get('/search/:term', verifyToken, ADMIN_ONLY, PetOwnerController.searchPetOwners);

export default router;
