import { Request, Response } from 'express';
import { supabase, isSupabaseConfigured } from '../database/supabase';
import { env } from '../config/env';
import { apiMetrics } from '../utils/metrics';
import { memoryCache } from '../utils/memoryCache';

export const healthController = {
  /**
   * GET /
   * Root endpoint — simple alive check.
   */
  root(req: Request, res: Response): void {
    res.status(200).json({
      success: true,
      data: {
        name: 'PakPrice API',
        version: '1.0.0',
        phase: 1,
        status: 'running',
      },
    });
  },

  /**
   * GET /health/live
   * Liveness probe: Answers "Is this process alive?".
   * Pure process alive check; does NOT perform database I/O.
   */
  live(req: Request, res: Response): void {
    res.status(200).json({
      success: true,
      data: {
        status: 'alive',
        uptime: Math.floor(process.uptime()),
        timestamp: new Date().toISOString(),
      },
    });
  },

  /**
   * GET /health/ready
   * Readiness probe: Answers "Can this instance currently serve requests?".
   * Verifies critical database dependency with a bounded 3-second timeout.
   * Returns 503 if database connectivity fails without leaking connection strings or credentials.
   */
  async ready(req: Request, res: Response): Promise<void> {
    if (!isSupabaseConfigured || !supabase) {
      res.status(503).json({
        success: false,
        error: {
          code: 'DATABASE_NOT_CONFIGURED',
          message: 'Database service is not configured.',
        },
        data: { status: 'not_ready' },
      });
      return;
    }

    try {
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Database ping timeout')), 3000)
      );

      const pingPromise = supabase.from('stores').select('id').limit(1);

      const { error } = (await Promise.race([pingPromise, timeoutPromise])) as any;
      if (error) throw error;

      res.status(200).json({
        success: true,
        data: {
          status: 'ready',
          database: 'connected',
          timestamp: new Date().toISOString(),
        },
      });
    } catch (err: any) {
      res.status(503).json({
        success: false,
        error: {
          code: 'DATABASE_UNAVAILABLE',
          message: 'Database readiness probe failed.',
        },
        data: {
          status: 'not_ready',
          reason: err.message === 'Database ping timeout' ? 'timeout' : 'connection_error',
        },
      });
    }
  },

  /**
   * GET /health/diagnostics
   * GET /api/v1/health/diagnostics
   * Protected diagnostics endpoint: Exposes operational metrics only to authenticated users.
   * NEVER exposes secrets, credentials, or internal database tokens.
   */
  diagnostics(req: Request, res: Response): void {
    const mem = process.memoryUsage();

    res.status(200).json({
      success: true,
      data: {
        version: '1.0.0',
        environment: env.NODE_ENV,
        nodeVersion: process.version,
        timestamp: new Date().toISOString(),
        uptimeSeconds: Math.floor(process.uptime()),
        memory: {
          rssMb: Math.round(mem.rss / (1024 * 1024)),
          heapUsedMb: Math.round(mem.heapUsed / (1024 * 1024)),
          heapTotalMb: Math.round(mem.heapTotal / (1024 * 1024)),
        },
        cache: {
          entries: memoryCache.size(),
        },
        metrics: apiMetrics.getSnapshot(),
      },
    });
  },

  /**
   * GET /health
   * GET /api/v1/health
   * General backward-compatible health check.
   */
  health(req: Request, res: Response): void {
    res.status(200).json({
      success: true,
      data: {
        status: 'healthy',
        environment: env.NODE_ENV,
        timestamp: new Date().toISOString(),
        database: {
          configured: isSupabaseConfigured,
          status: isSupabaseConfigured ? 'configured' : 'not_configured',
        },
        uptime: process.uptime(),
      },
    });
  },
};
