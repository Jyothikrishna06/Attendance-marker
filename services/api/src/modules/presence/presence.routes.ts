import { Router } from 'express';
import { PresenceController } from './presence.controller.js';
import { authenticate } from '../../common/middleware/auth.middleware.js';
import { requireRoles } from '../../common/middleware/rbac.middleware.js';
import { createRateLimiter } from '../../common/middleware/rateLimiter.middleware.js';

export function createPresenceRouter(controller: PresenceController): Router {
  const router = Router();

  const entryStartLimiter = createRateLimiter({
    windowMs: 60 * 1000,
    maxAttempts: 20,
    message: 'Too many presence challenge requests. Please wait before retrying.',
    keyGenerator: (req) => `${req.user?.userId || req.ip}-presence-start`,
  });

  const entryVerifyLimiter = createRateLimiter({
    windowMs: 60 * 1000,
    maxAttempts: 25,
    message: 'Too many presence verification attempts. Please wait before retrying.',
    keyGenerator: (req) => `${req.user?.userId || req.ip}-presence-verify`,
  });

  // All presence endpoints require valid authentication
  router.use(authenticate);

  // Resident Presence Actions
  router.post('/entry/start', requireRoles('RESIDENT'), entryStartLimiter, controller.startEntry);
  router.post('/entry/verify', requireRoles('RESIDENT'), entryVerifyLimiter, controller.verifyEntry);
  router.post('/exit', requireRoles('RESIDENT'), controller.recordExit);
  router.get('/me', requireRoles('RESIDENT'), controller.getMyPresence);

  // Status overview (Accessible to Wardens, Admins, and Residents for their own profile)
  router.get(
    '/status',
    requireRoles('RESIDENT', 'WARDEN', 'ADMIN', 'SUPER_ADMIN'),
    controller.getStatus
  );

  return router;
}
