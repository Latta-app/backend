import { Router } from 'express';
import ClaimRoutes from '../routetes/ClaimRoutes.js';
import UserRoutes from './private/user.routes.js';
import PetOwnerRoutes from './private/pet-owners.routes.js';
import PetRoutes from './private/pet.routes.js';
import VaccineRoutes from './private/vaccine.routes.js';
import AuthRoutes from './private/auth.routes.js';
import ProtocolRoutes from './private/protocol.routes.js';

const router = Router();

router.use('/set-custom-claims', ClaimRoutes);
router.use('/auth', AuthRoutes);
router.use('/users', UserRoutes);
router.use('/pet-owner', PetOwnerRoutes);
router.use('/pet', PetRoutes);
router.use('/vaccine', VaccineRoutes);
router.use('/protocol', ProtocolRoutes);

export default router;
