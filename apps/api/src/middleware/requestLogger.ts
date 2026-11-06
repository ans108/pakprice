import { Request, Response, NextFunction } from 'express';
import logger from '../utils/logger';
import { apiMetrics } from '../utils/metrics';

export const requestLogger = (req: Request, res: Response, next: NextFunction): void => {
  const start = Date.now();
  apiMetrics.recordRequestStart();

  res.on('finish', () => {
    const durationMs = Date.now() - start;
    apiMetrics.recordRequestEnd(res.statusCode, durationMs);

    const logPayload = {
      requestId: req.id || 'unknown',
      method: req.method,
      path: req.baseUrl ? `${req.baseUrl}${req.path}` : req.originalUrl || req.url,
      statusCode: res.statusCode,
      durationMs,
      userId: req.user?.id, // Only safe user ID when authenticated
      ip: req.ip,
      userAgent: req.get('user-agent'),
    };

    if (res.statusCode >= 500) {
      logger.error(logPayload, 'Request completed with server error');
    } else if (res.statusCode >= 400) {
      logger.warn(logPayload, 'Request completed with client error');
    } else {
      logger.info(logPayload, 'Request completed');
    }
  });

  next();
};
