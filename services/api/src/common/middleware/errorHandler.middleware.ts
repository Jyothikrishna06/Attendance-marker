import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { AppError } from '../errors.js';
import { env } from '../../config/env.js';

/**
 * Global Express error handling middleware ensuring consistent JSON problem details.
 */
export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  const timestamp = new Date().toISOString();

  // 1. Zod Schema Validation Errors
  if (err instanceof ZodError) {
    res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Request payload validation failed',
        details: err.errors.map((e) => ({
          field: e.path.join('.'),
          message: e.message,
        })),
      },
      timestamp,
    });
    return;
  }

  // 2. Custom Domain Application Errors
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      error: {
        code: err.code,
        message: err.message,
        details: err.details || null,
      },
      timestamp,
    });
    return;
  }

  // 3. Fallback for unhandled internal server exceptions
  console.error('[Unhandled Internal Error]:', err);
  res.status(500).json({
    error: {
      code: 'INTERNAL_SERVER_ERROR',
      message: env.NODE_ENV === 'production' 
        ? 'An unexpected internal server error occurred' 
        : err.message,
      details: env.NODE_ENV === 'development' ? err.stack : null,
    },
    timestamp,
  });
}
