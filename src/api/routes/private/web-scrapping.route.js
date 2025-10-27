import { Router } from 'express';
import WebScrappingController from '../../controllers/web-scarpping.controller.js';

const router = Router();

router.post('/petz', WebScrappingController.startScrapping);

export default router;
