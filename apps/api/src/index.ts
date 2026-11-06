import app from './app';
import { env } from './config/env';
import logger from './utils/logger';

const { PORT } = env;
const SHUTDOWN_TIMEOUT_MS = parseInt(process.env.SHUTDOWN_TIMEOUT_MS || '10000', 10);

const server = app.listen(PORT, () => {
  logger.info(`PakPrice API running on http://localhost:${PORT}`);
  logger.info(`Environment: ${env.NODE_ENV}`);
  logger.info('Health probes:');
  logger.info(`  GET http://localhost:${PORT}/health/live  (Liveness)`);
  logger.info(`  GET http://localhost:${PORT}/health/ready (Readiness)`);
});

let isShuttingDown = false;

/**
 * Bounded graceful shutdown handler.
 * Prevents duplicate shutdown races and forces exit if connections hang.
 */
export const shutdown = (signal: string, exitCode = 0): void => {
  if (isShuttingDown) {
    logger.warn({ signal }, 'Shutdown already in progress; ignoring duplicate signal');
    return;
  }
  isShuttingDown = true;
  logger.info({ signal, timeoutMs: SHUTDOWN_TIMEOUT_MS }, 'Initiating bounded graceful shutdown...');

  // Fallback timer: Force exit if gracefully draining connections takes longer than SHUTDOWN_TIMEOUT_MS
  const timer = setTimeout(() => {
    logger.fatal({ signal }, 'Graceful shutdown timed out. Forcing process exit.');
    process.exit(exitCode === 0 ? 1 : exitCode);
  }, SHUTDOWN_TIMEOUT_MS);
  timer.unref();

  server.close((err) => {
    clearTimeout(timer);
    if (err) {
      logger.error({ err: err.message }, 'Error closing HTTP server');
      process.exit(1);
    } else {
      logger.info('HTTP server closed cleanly. Exiting.');
      process.exit(exitCode);
    }
  });
};

// ── Process-Level Signal & Fatal Error Handlers ──────────────

process.on('SIGTERM', () => shutdown('SIGTERM', 0));
process.on('SIGINT', () => shutdown('SIGINT', 0));

process.on('unhandledRejection', (reason: unknown) => {
  const errPayload = reason instanceof Error
    ? { name: reason.name, message: reason.message, stack: reason.stack }
    : { message: String(reason) };

  logger.fatal({ err: errPayload }, 'Unhandled Promise Rejection detected');
  shutdown('unhandledRejection', 1);
});

process.on('uncaughtException', (err: Error) => {
  logger.fatal(
    {
      err: {
        name: err.name,
        message: err.message,
        stack: err.stack,
      },
    },
    'Uncaught Exception detected'
  );
  shutdown('uncaughtException', 1);
});

export default server;
