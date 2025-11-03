import { Router } from 'express';
import n8nController from '../../controllers/n8n.controller.js';

const router = Router();

router.post('/whatsapp/flow/decrypt', n8nController.decryptWhatsAppFlow);
router.post('/whatsapp/flow/encrypt', n8nController.encryptWhatsAppResponse);
router.post('/whatsapp/media/decrypt', n8nController.decryptMedia);

export default router;
