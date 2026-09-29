import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { AccessTokenPayload, RefreshTokenPayload } from '../common/types.js';
import { UnauthorizedError } from '../common/errors.js';

/**
 * Signs an access token with a short TTL (15m default).
 */
export function signAccessToken(payload: AccessTokenPayload): string {
  return jwt.sign(payload, env.JWT_ACCESS_SECRET, {
    expiresIn: env.JWT_ACCESS_EXPIRES_IN as jwt.SignOptions['expiresIn'],
    algorithm: 'HS256',
  });
}

/**
 * Signs a refresh token with a longer TTL (7d default).
 */
export function signRefreshToken(payload: RefreshTokenPayload): string {
  return jwt.sign(payload, env.JWT_REFRESH_SECRET, {
    expiresIn: env.JWT_REFRESH_EXPIRES_IN as jwt.SignOptions['expiresIn'],
    algorithm: 'HS256',
  });
}

/**
 * Verifies and decodes an access token.
 */
export function verifyAccessToken(token: string): AccessTokenPayload {
  try {
    return jwt.verify(token, env.JWT_ACCESS_SECRET, {
      algorithms: ['HS256'],
    }) as AccessTokenPayload;
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      throw new UnauthorizedError('Access token has expired', 'TOKEN_EXPIRED');
    }
    throw new UnauthorizedError('Invalid access token signature', 'INVALID_TOKEN');
  }
}

/**
 * Verifies and decodes a refresh token.
 */
export function verifyRefreshToken(token: string): RefreshTokenPayload {
  try {
    return jwt.verify(token, env.JWT_REFRESH_SECRET, {
      algorithms: ['HS256'],
    }) as RefreshTokenPayload;
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      throw new UnauthorizedError('Refresh token has expired', 'REFRESH_TOKEN_EXPIRED');
    }
    throw new UnauthorizedError('Invalid refresh token signature', 'INVALID_REFRESH_TOKEN');
  }
}
