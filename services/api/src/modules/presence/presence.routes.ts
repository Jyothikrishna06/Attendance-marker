import { Router } from 'express';
import { PresenceController } from './presence.controller.js';
import { authenticate } from '../../common/middleware/auth.middleware.js';
import { requireRoles } from '../../common/middleware/rbac.middleware.js';

export function createPresenceRouter(controller: PresenceController): Router {
  const router = Router();

  // All presence endpoints require valid authentication
  router.use(authenticate);

  // Resident Presence Actions
  router.post('/entry/start', requireRoles('RESIDENT'), controller.startEntry);
  router.post('/entry/verify', requireRoles('RESIDENT'), controller.verifyEntry);
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
