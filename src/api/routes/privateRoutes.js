import { Router } from 'express';
import express from 'express';
import AuthRoutes from './private/auth.routes.js';
import ChatHistoryRoutes from './private/chat-history.routes.js';
import PetOwnerRoutes from './private/pet-owners.routes.js';
import PetRoutes from './private/pet.routes.js';
import ProtocolRoutes from './private/protocol.routes.js';
import SchedulingRoutes from './private/scheduling.routes.js';
import ServiceTypeRoutes from './private/service-type.routes.js';
import TagsRoutes from './private/tags.routes.js';
import TemplateRoutes from './private/template.routes.js';
import UserRoutes from './private/user.routes.js';
import VaccineRoutes from './private/vaccine.routes.js';
import N8NRoutes from './private/n8n.routes.js';
import WebScrappingRoutes from './private/web-scrapping.route.js';
import VarejonlineRoutes from './private/varejonline.routes.js';

const router = Router();

router.use('/auth', AuthRoutes);
router.use('/chat-history', ChatHistoryRoutes);
router.use('/pet-owner', PetOwnerRoutes);
router.use('/pet', PetRoutes);
router.use('/protocol', ProtocolRoutes);
router.use('/scheduling', SchedulingRoutes);
router.use('/service-type', ServiceTypeRoutes);
router.use('/tags', TagsRoutes);
router.use('/template', TemplateRoutes);
router.use('/users', UserRoutes);
router.use('/vaccine', VaccineRoutes);
router.use(
  '/n8n',
  express.json({ limit: '50mb' }),
  express.urlencoded({ extended: true, limit: '50mb' }),
  N8NRoutes,
);
router.use('/web-scrapping', WebScrappingRoutes);
router.use('/oauth/varejonline', VarejonlineRoutes);

export default router;
