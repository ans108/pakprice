import { Request, Response, NextFunction } from 'express';
import logger from '../utils/logger';

export interface AppError extends Error {
  statusCode?: number;
  code?: string;
  isOperational?: boolean;
}

function mapStatusToCode(status: number): string {
  switch (status) {
    case 400: return 'BAD_REQUEST';
    case 401: return 'UNAUTHORIZED';
    case 403: return 'FORBIDDEN';
    case 404: return 'NOT_FOUND';
    case 409: return 'CONFLICT';
    case 422: return 'UNPROCESSABLE_ENTITY';
    case 429: return 'TOO_MANY_REQUESTS';
    case 503: return 'SERVICE_UNAVAILABLE';
    default: return 'INTERNAL_ERROR';
  }
}

export const errorHandler = (
  err: AppError,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction
): void => {
  const statusCode = err.statusCode ?? 500;
  const isProduction = process.env.NODE_ENV === 'production';
  const requestId = req.id || 'unknown';

  const errorCode = err.code || mapStatusToCode(statusCode);
  const clientMessage = isProduction && statusCode === 500
    ? 'An unexpected error occurred. Please try again later.'
    : err.message || 'An unexpected error occurred.';

  // Log full error details on server side only
  logger.error(
    {
      requestId,
      method: req.method,
      url: req.originalUrl,
      statusCode,
      errorCode,
      err: {
        name: err.name,
        message: err.message,
        stack: err.stack,
      },
    },
    `Error handling request: ${err.message}`
  );

  // Return standardized, sanitized JSON envelope
  res.status(statusCode).json({
    success: false,
    error: {
      code: errorCode,
      message: clientMessage,
    },
    message: clientMessage, // Backward compatibility
    statusCode,
    requestId,
  });
};

export const notFoundHandler = (req: Request, res: Response): void => {
  const requestId = req.id || 'unknown';
  const message = `Route ${req.method} ${req.originalUrl} not found`;

  res.status(404).json({
    success: false,
    error: {
      code: 'NOT_FOUND',
      message,
    },
    message,
    statusCode: 404,
    requestId,
  });
};
