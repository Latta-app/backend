import { Router } from 'express';
import n8nController from '../../controllers/n8n.controller.js';

const router = Router();

router.post('/whatsapp/flow', n8nController.whatsappFlow);

router.post('/download-image', n8nController.downloadImage);

export default router;
