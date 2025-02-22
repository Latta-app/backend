import { Router } from 'express';
import PetOwnerController from '../../controllers/pet-owner.controller.js';
import { verifyToken } from '../../middlewares/auth.middleware.js';

const router = Router();

router.post('/', verifyToken, PetOwnerController.createPetOwner);

router.get('/', verifyToken, PetOwnerController.getAllPetOwners);

router.get('/:id', verifyToken, PetOwnerController.getPetOwnerById);

router.put('/:id', verifyToken, PetOwnerController.updatePetOwner);

router.delete('/:id', verifyToken, PetOwnerController.deletePetOwner);

router.get('/search/:term', verifyToken, PetOwnerController.searchPetOwners);

export default router;
