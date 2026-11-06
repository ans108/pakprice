import { Request, Response, NextFunction } from 'express';
import { supabase } from '../database/supabase';
import type { AuthUser } from '@pakprice/shared';
import logger from '../utils/logger';

// Extend Express Request to include authenticated user
declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

/**
 * requireAuth — Express middleware that verifies a Supabase access token.
 *
 * Reads the `Authorization: Bearer <token>` header, verifies the token
 * with Supabase Auth, and attaches `req.user = { id, email }`.
 *
 * Returns 401 if:
 *   - No Authorization header
 *   - Invalid/expired token
 *   - Supabase is not configured
 */
export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  if (!supabase) {
    res.status(503).json({
      success: false,
      error: 'Service Unavailable',
      message: 'Authentication service is not configured.',
      statusCode: 503,
    });
    return;
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({
      success: false,
      error: 'Unauthorized',
      message: 'Authentication required. Provide a valid Bearer token.',
      statusCode: 401,
    });
    return;
  }

  const token = authHeader.slice(7); // strip "Bearer "

  try {
    const { data, error } = await supabase.auth.getUser(token);

    if (error || !data.user) {
      res.status(401).json({
        success: false,
        error: 'Unauthorized',
        message: 'Invalid or expired access token.',
        statusCode: 401,
      });
      return;
    }

    req.user = {
      id: data.user.id,
      email: data.user.email ?? '',
    };

    next();
  } catch (err) {
    logger.error({ err }, 'Auth middleware error');
    res.status(401).json({
      success: false,
      error: 'Unauthorized',
      message: 'Authentication failed.',
      statusCode: 401,
    });
  }
}

/**
 * optionalAuth — like requireAuth but does not reject unauthenticated requests.
 * If a valid token is present, sets req.user. Otherwise, req.user is undefined.
 */
export async function optionalAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  if (!supabase) {
    next();
    return;
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    next();
    return;
  }

  const token = authHeader.slice(7);

  try {
    const { data, error } = await supabase.auth.getUser(token);
    if (!error && data.user) {
      req.user = {
        id: data.user.id,
        email: data.user.email ?? '',
      };
    }
  } catch {
    // Silently continue — user remains unauthenticated
  }

  next();
}
