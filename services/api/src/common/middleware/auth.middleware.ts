import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken } from '../../core/jwt.js';
import { UnauthorizedError, ForbiddenError } from '../errors.js';
import { AccessTokenPayload } from '../types.js';

// Extend Express Request type to include authenticated user
declare global {
  namespace Express {
    interface Request {
      user?: AccessTokenPayload;
    }
  }
}

/**
 * Middleware that authenticates incoming requests using a Bearer access token.
 */
export function authenticate(req: Request, _res: Response, next: NextFunction): void {
  let token = '';

  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7).trim();
  } else if (req.headers.cookie) {
    const match = req.headers.cookie.match(/(?:^|;\s*)auth_token=([^;]+)/);
    if (match) {
      token = decodeURIComponent(match[1]);
    }
  }

  if (!token) {
    throw new UnauthorizedError('Missing or malformed Authorization header. Expected Bearer token.', 'AUTH_HEADER_MISSING');
  }

  const payload = verifyAccessToken(token);

  // Enforce account status check
  if (payload.status !== 'ACTIVE') {
    throw new ForbiddenError(`Account is not active. Current status: ${payload.status}`, 'ACCOUNT_INACTIVE');
  }

  req.user = payload;
  next();
}
