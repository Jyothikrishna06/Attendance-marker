import { Router } from 'express';
import { ReportingController } from './reporting.controller.js';
import { authenticate } from '../../common/middleware/auth.middleware.js';
import { requireRoles } from '../../common/middleware/rbac.middleware.js';

export function createReportingRouter(controller: ReportingController): Router {
  const router = Router();

  // Authentication and Strict Staff RBAC Guard (Wardens, Admins, Super Admins)
  router.use(authenticate);
  const staffGuard = requireRoles('WARDEN', 'ADMIN', 'SUPER_ADMIN');

  router.get('/daily-attendance', staffGuard, controller.getDailyAttendance);
  router.get('/presence', staffGuard, controller.getDailyAttendance);
  router.get('/late-returns', staffGuard, controller.getLateReturns);
  router.get('/leaves', staffGuard, controller.getLeaves);
  router.get('/verification-failures', staffGuard, controller.getVerificationFailures);
  router.get('/audit', staffGuard, controller.getAuditReport);

  return router;
}
