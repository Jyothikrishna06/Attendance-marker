import { Router } from 'express';
import { AuthController } from './auth.controller.js';
import { authenticate } from '../../common/middleware/auth.middleware.js';
import { requireRoles } from '../../common/middleware/rbac.middleware.js';
import { createRateLimiter } from '../../common/middleware/rateLimiter.middleware.js';
import { env } from '../../config/env.js';

export function createAuthRouter(controller: AuthController): Router {
  const router = Router();

  // Rate limiter specifically for brute-force vulnerable endpoints (login & activation)
  const authRateLimiter = createRateLimiter({
    windowMs: env.RATE_LIMIT_WINDOW_MS,
    maxAttempts: env.RATE_LIMIT_MAX_ATTEMPTS,
    message: 'Too many authentication attempts. Please try again after 15 minutes.',
  });

  // Public Endpoints
  router.post('/login', authRateLimiter, controller.login);
  router.post('/refresh', controller.refresh);
  router.post('/logout', controller.logout);
  router.post('/activate', authRateLimiter, controller.activate);

  // Protected Endpoints (Resident only)
  router.post(
    '/device/register',
    authenticate,
    requireRoles('RESIDENT'),
    controller.registerDevice
  );

  return router;
}
