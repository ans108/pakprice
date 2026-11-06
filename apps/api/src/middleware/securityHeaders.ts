import { Request, Response, NextFunction } from 'express';

/**
 * Lightweight HTTP security headers middleware.
 * Provides essential header protections without heavy third-party dependencies.
 */
export const securityHeadersMiddleware = (req: Request, res: Response, next: NextFunction): void => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('X-XSS-Protection', '0'); // Modern best practice: disable legacy buggy XSS filters
  next();
};
