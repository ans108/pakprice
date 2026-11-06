import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';

// Extend Express Request to include id / requestId
declare global {
  namespace Express {
    interface Request {
      id?: string;
      requestId?: string;
    }
  }
}

/** Explicitly safe character whitelist for incoming X-Request-ID */
const SAFE_REQUEST_ID_REGEX = /^[A-Za-z0-9._:-]{1,64}$/;

/**
 * Validates an incoming client request ID or generates a secure UUID v4.
 * Never echoes unvalidated arbitrary client strings.
 */
export function getValidatedRequestId(headerValue?: string | string[]): string {
  if (typeof headerValue === 'string') {
    const trimmed = headerValue.trim();
    if (SAFE_REQUEST_ID_REGEX.test(trimmed)) {
      return trimmed;
    }
  }
  return crypto.randomUUID();
}

/**
 * Request ID middleware.
 * Attaches a validated correlation ID to req and sets the X-Request-ID response header.
 */
export const requestIdMiddleware = (req: Request, res: Response, next: NextFunction): void => {
  const rawHeader = req.headers['x-request-id'];
  const requestId = getValidatedRequestId(rawHeader);

  req.id = requestId;
  req.requestId = requestId;
  res.setHeader('X-Request-ID', requestId);

  next();
};
