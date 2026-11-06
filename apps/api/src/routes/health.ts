import { Router } from 'express';
import { healthController } from '../controllers/healthController';
import { requireAuth } from '../middleware/auth';

const router = Router();

// GET /api/v1/health
router.get('/', healthController.health);

// GET /api/v1/health/live (public liveness)
router.get('/live', healthController.live);

// GET /api/v1/health/ready (public readiness probe)
router.get('/ready', healthController.ready);

// GET /api/v1/health/diagnostics (protected by requireAuth)
router.get('/diagnostics', requireAuth, healthController.diagnostics);

export default router;
