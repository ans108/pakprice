import { Router } from 'express';
import { searchController } from '../controllers/searchController';
import { searchRateLimitMiddleware } from '../middleware/rateLimit';

const router = Router();

// GET /api/v1/search/suggestions (lightweight autocomplete)
router.get('/suggestions', searchRateLimitMiddleware, searchController.suggestions);

// GET /api/v1/search (rate-limited)
router.get('/', searchRateLimitMiddleware, searchController.search);

export default router;
