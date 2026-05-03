import type { ErrorRequestHandler, Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { logger } from '../config/logger.js';
import type { ServiceResponse } from '../repositories/types.js';

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

export const notFoundHandler = (req: Request, res: Response, _next: NextFunction): void => {
  const body: ServiceResponse<never> = {
    success: false,
    error: `Not found: ${req.method} ${req.originalUrl}`,
  };
  res.status(404).json(body);
};

/**
 * Converts thrown errors into the `ServiceResponse<never>` shape the FE
 * expects. HTTP status mirrors the error type:
 *   - HttpError → its `status`
 *   - ZodError  → 400
 *   - everything else → 500
 */
export const errorHandler: ErrorRequestHandler = (err, req, res, _next): void => {
  if (err instanceof HttpError) {
    logger.warn({ err, path: req.originalUrl }, 'HttpError');
    const body: ServiceResponse<never> = {
      success: false,
      error: err.message,
      message: err.details ? String(err.details) : undefined,
    };
    res.status(err.status).json(body);
    return;
  }

  if (err instanceof ZodError) {
    logger.warn({ issues: err.issues, path: req.originalUrl }, 'Validation error');
    const body: ServiceResponse<never> = {
      success: false,
      error: 'Validation failed',
      message: err.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
    };
    res.status(400).json(body);
    return;
  }

  logger.error({ err, path: req.originalUrl }, 'Unhandled error');
  const body: ServiceResponse<never> = {
    success: false,
    error: 'Internal server error',
  };
  res.status(500).json(body);
};
