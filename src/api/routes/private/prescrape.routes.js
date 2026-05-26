import { Router } from 'express';
import express from 'express';
import PrescrapeController from '../../controllers/prescrape.controller.js';

const router = Router();

// Webhook chamado pela EF Supabase marketplace-service após productSearch.
// Body: { phone, product_ids: [id1, ...] } (max 5 ids processados).
// Despacha N EF calls paralelas pra "preheat_product" (cada uma com seu
// próprio CPU budget de 2s, evitando o estouro que ocorria com pre-scrape
// inline na mesma EF call do search).
router.post('/prescrape-trigger', express.json(), PrescrapeController.triggerPrescrape);

export default router;
