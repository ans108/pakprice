import pino from 'pino';
import { env } from '../config/env';

const logger = pino(
  {
    level: env.NODE_ENV === 'production' ? 'info' : 'debug',
    base: { service: 'pakprice-api' },
    redact: {
      paths: [
        'req.headers.authorization',
        'req.headers.cookie',
        'headers.authorization',
        'headers.cookie',
        'authorization',
        'cookie',
        'password',
        'token',
        'key',
        'serviceRoleKey',
        'supabaseKey',
        '*.password',
        '*.token',
        '*.key',
      ],
      censor: '[REDACTED]',
    },
  },
  env.NODE_ENV === 'production'
    ? undefined
    : pino.transport({
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:HH:MM:ss',
          ignore: 'pid,hostname',
        },
      })
);

export default logger;
