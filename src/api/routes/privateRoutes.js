import { Router } from 'express';
import AuthRoutes from './private/auth.routes.js';
import ChatHistoryRoutes from './private/chat-history.routes.js';
import PetOwnerRoutes from './private/pet-owners.routes.js';
import PetRoutes from './private/pet.routes.js';
import ProtocolRoutes from './private/protocol.routes.js';
import SchedulingRoutes from './private/scheduling.routes.js';
import ServiceTypeRoutes from './private/service-type.routes.js';
import UserRoutes from './private/user.routes.js';
import VaccineRoutes from './private/vaccine.routes.js';

const router = Router();

router.use('/auth', AuthRoutes);
router.use('/chat-history', ChatHistoryRoutes);
router.use('/pet-owner', PetOwnerRoutes);
router.use('/pet', PetRoutes);
router.use('/protocol', ProtocolRoutes);
router.use('/scheduling', SchedulingRoutes);
router.use('/service-type', ServiceTypeRoutes);
router.use('/users', UserRoutes);
router.use('/vaccine', VaccineRoutes);

export default router;
