import { Router } from 'express';
import { productsController } from '../controllers/productsController';
import { priceHistoryController } from '../controllers/priceHistoryController';
import { compareRateLimitMiddleware, priceHistoryRateLimitMiddleware } from '../middleware/rateLimit';

const router = Router();

// GET /api/v1/products
router.get('/', productsController.list);

// GET /api/v1/products/compare
router.get('/compare', compareRateLimitMiddleware, productsController.compare);

// GET /api/v1/products/:slug
router.get('/:slug', productsController.detail);

// GET /api/v1/products/:slug/variants
router.get('/:slug/variants', productsController.variants);

// GET /api/v1/products/:slug/offers
// Returns all price offers across all stores for a product — read-only aggregation.
router.get('/:slug/offers', productsController.offers);

// GET /api/v1/products/:slug/price-history
router.get('/:slug/price-history', priceHistoryRateLimitMiddleware, priceHistoryController.getHistory);

export default router;
