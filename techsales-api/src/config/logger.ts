import pino from 'pino';
import { env } from './env.js';

const isProd = env.NODE_ENV === 'production';

const options: pino.LoggerOptions = {
  level: process.env.LOG_LEVEL ?? (isProd ? 'info' : 'debug'),
  base: { service: 'medhub-techsales-api' },
};

if (!isProd) {
  options.transport = {
    target: 'pino-pretty',
    options: {
      colorize: true,
      translateTime: 'SYS:HH:MM:ss.l',
      ignore: 'pid,hostname,service',
    },
  };
}

export const logger = pino(options);
export type Logger = typeof logger;
