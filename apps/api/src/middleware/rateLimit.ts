import rateLimit from 'express-rate-limit';
import { env } from '../config/env';

function buildRateLimitResponse(message: string) {
  return (req: any, res: any) => {
    const requestId = req.id || 'unknown';
    res.status(429).json({
      success: false,
      error: {
        code: 'TOO_MANY_REQUESTS',
        message,
      },
      message,
      statusCode: 429,
      requestId,
    });
  };
}

/** Global default rate limiter for baseline API traffic */
export const rateLimitMiddleware = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  max: env.RATE_LIMIT_MAX_REQUESTS,
  standardHeaders: true,
  legacyHeaders: false,
  handler: buildRateLimitResponse('You have exceeded the rate limit. Please try again later.'),
});

/** Specific limiter for search queries (prevents database search saturation) */
export const searchRateLimitMiddleware = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 60,            // 60 requests/minute per IP
  standardHeaders: true,
  legacyHeaders: false,
  handler: buildRateLimitResponse('Search rate limit exceeded. Please wait a minute.'),
});

/** Specific limiter for product comparisons (multi-item aggregation) */
export const compareRateLimitMiddleware = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 30,            // 30 requests/minute per IP
  standardHeaders: true,
  legacyHeaders: false,
  handler: buildRateLimitResponse('Compare rate limit exceeded. Please wait a minute.'),
});

/** Specific limiter for price history queries */
export const priceHistoryRateLimitMiddleware = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 60,            // 60 requests/minute per IP
  standardHeaders: true,
  legacyHeaders: false,
  handler: buildRateLimitResponse('Price history rate limit exceeded. Please wait a minute.'),
});

/** Strict limiter for authentication-sensitive endpoints */
export const authRateLimitMiddleware = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20,                  // 20 requests per 15 minutes per IP
  standardHeaders: true,
  legacyHeaders: false,
  handler: buildRateLimitResponse('Authentication attempt limit exceeded. Please try again later.'),
});
