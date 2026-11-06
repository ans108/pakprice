import { Router } from 'express';
import { healthController } from '../controllers/healthController';
import healthRoutes from './health';
import storesRoutes from './stores';
import categoriesRoutes from './categories';
import brandsRoutes from './brands';
import productsRoutes from './products';
import searchRoutes from './search';
import profileRoutes from './profile';
import favoritesRoutes from './favorites';
import alertsRoutes from './alerts';
import couponsRoutes from './coupons';
import bankOffersRoutes from './bankOffers';
import searchHistoryRoutes from './searchHistory';
import { optionalAuth } from '../middleware/auth';

const router = Router();

// Apply optional auth globally so req.user is available if logged in
router.use(optionalAuth);

// ── Phase 1 routes ───────────────────────────────────────────
// GET /api/v1/health/*
router.use('/health', healthRoutes);

// GET /api/v1/stores
router.use('/stores', storesRoutes);

// ── Phase 2 routes ───────────────────────────────────────────
// GET /api/v1/categories
router.use('/categories', categoriesRoutes);

// GET /api/v1/brands
router.use('/brands', brandsRoutes);

// GET /api/v1/products, /api/v1/products/:slug, /api/v1/products/:slug/variants
router.use('/products', productsRoutes);

// GET /api/v1/search
router.use('/search', searchRoutes);

// ── Phase 4 routes ───────────────────────────────────────────

router.use('/profile', profileRoutes);
router.use('/favorites', favoritesRoutes);
router.use('/price-alerts', alertsRoutes);
router.use('/alerts', alertsRoutes); // Backward compatibility alias
router.use('/coupons', couponsRoutes);
router.use('/bank-offers', bankOffersRoutes);
router.use('/search-history', searchHistoryRoutes);

export default router;
