import express from 'express';
import { requestIdMiddleware } from './middleware/requestId';
import { securityHeadersMiddleware } from './middleware/securityHeaders';
import { corsMiddleware } from './middleware/cors';
import { rateLimitMiddleware } from './middleware/rateLimit';
import { requestLogger } from './middleware/requestLogger';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { healthController } from './controllers/healthController';
import { requireAuth } from './middleware/auth';
import v1Routes from './routes/index';

const app = express();

// ── 1. Request ID (Correlation) ──────────────────────────────
app.use(requestIdMiddleware);

// ── 2. Security Headers & CORS ──────────────────────────────
app.disable('x-powered-by');
app.use(securityHeadersMiddleware);
app.use(corsMiddleware);

// ── 3. Body Parsing ──────────────────────────────────────────
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// ── 4. Baseline Rate Limiting ────────────────────────────────
app.use(rateLimitMiddleware);

// ── 5. Request Logging & Metrics ─────────────────────────────
app.use(requestLogger);

// ── 6. Root & Health Endpoints ───────────────────────────────

// GET / — root endpoint (alive check)
app.get('/', healthController.root);

// GET /health — backward-compatible general health
app.get('/health', healthController.health);

// GET /health/live — liveness probe (no DB I/O)
app.get('/health/live', healthController.live);

// GET /health/ready — readiness probe (bounded DB ping)
app.get('/health/ready', healthController.ready);

// GET /health/diagnostics — protected diagnostics (requires authentication)
app.get('/health/diagnostics', requireAuth, healthController.diagnostics);

// ── 7. Versioned API Routes ──────────────────────────────────
// Mounts /api/v1/*
app.use('/api/v1', v1Routes);

// ── 8. 404 & Centralized Error Handling ──────────────────────
app.use(notFoundHandler);
app.use(errorHandler);

export default app;
