import { Request, Response, NextFunction } from 'express';
import { TooManyRequestsError } from '../errors.js';

interface RateLimitRecord {
  count: number;
  resetTime: number;
}

interface RateLimitOptions {
  windowMs: number;
  maxAttempts: number;
  message?: string;
  keyGenerator?: (req: Request) => string;
}

/**
 * In-memory sliding window rate limiter for brute-force protection on authentication endpoints.
 */
export function createRateLimiter(options: RateLimitOptions) {
  const hits = new Map<string, RateLimitRecord>();

  // Cleanup expired entries periodically (every 5 minutes)
  const cleanupInterval = setInterval(() => {
    const now = Date.now();
    for (const [key, record] of hits.entries()) {
      if (now > record.resetTime) {
        hits.delete(key);
      }
    }
  }, 5 * 60 * 1000);

  // Prevent interval from hanging node test processes
  if (cleanupInterval.unref) {
    cleanupInterval.unref();
  }

  return (req: Request, res: Response, next: NextFunction): void => {
    const clientKey = options.keyGenerator 
      ? options.keyGenerator(req) 
      : (req.ip || req.socket.remoteAddress || 'unknown-client');

    const now = Date.now();
    let record = hits.get(clientKey);

    const maxAttempts = options.maxAttempts || 100;
    const windowMs = options.windowMs || 60 * 1000;

    if (!record || now > record.resetTime) {
      record = {
        count: 1,
        resetTime: now + windowMs,
      };
      hits.set(clientKey, record);
    } else {
      record.count += 1;
    }

    const remaining = Math.max(0, maxAttempts - record.count);
    const retryAfterSeconds = Math.ceil((record.resetTime - now) / 1000);

    res.setHeader('X-RateLimit-Limit', String(maxAttempts));
    res.setHeader('X-RateLimit-Remaining', String(remaining));
    res.setHeader('X-RateLimit-Reset', String(Math.ceil(record.resetTime / 1000)));

    if (record.count > maxAttempts) {
      res.setHeader('Retry-After', String(retryAfterSeconds));
      throw new TooManyRequestsError(options.message || 'Too many authentication attempts. Please try again later.');
    }

    next();
  };
}
