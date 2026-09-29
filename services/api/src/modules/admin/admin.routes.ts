import { Router } from 'express';
import { AdminController } from './admin.controller.js';
import { authenticate } from '../../common/middleware/auth.middleware.js';
import { requireRoles } from '../../common/middleware/rbac.middleware.js';

import { CurfewEvaluationController } from '../curfew-evaluation/index.js';

export function createAdminRouter(
  controller: AdminController,
  evalController?: CurfewEvaluationController
): Router {
  const router = Router();

  // Enforce authentication on all admin/warden endpoints
  router.use(authenticate);

  // Strict RBAC Guard: Only WARDEN, ADMIN, and SUPER_ADMIN roles are permitted
  const adminGuard = requireRoles('WARDEN', 'ADMIN', 'SUPER_ADMIN');

  // Curfew Management
  router.post('/curfew', adminGuard, controller.createCurfewRule);
  router.patch('/curfew/:id', adminGuard, controller.updateCurfewRule);
  router.get('/curfew/status', adminGuard, controller.getCurfewStatus);

  // Curfew Automated Evaluation Engine
  if (evalController) {
    router.post('/curfew/evaluate', adminGuard, evalController.evaluateCurfew);
    router.get('/curfew/evaluation', adminGuard, evalController.getEvaluationHistory);
  }

  // Leave Adjudication
  router.get('/leave', adminGuard, controller.getLeaveRequests);
  router.patch('/leave/:id', adminGuard, controller.updateLeaveStatus);

  // Presence Record Correction (supports POST /admin/presence/correct and PATCH /admin/presence/:id/correct)
  router.post('/presence/correct', adminGuard, controller.correctRecord);
  router.patch('/presence/:id/correct', adminGuard, controller.correctRecord);

  // Audit Logs
  router.get('/audit', adminGuard, controller.getAuditLogs);

  return router;
}

export function createCurfewPublicRouter(controller: AdminController): Router {
  const router = Router();

  // GET /curfew/current - can be queried by residents as well as staff
  router.use(authenticate);
  router.get('/current', controller.getCurrentCurfew);

  return router;
}
