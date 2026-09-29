import express, { Express, Request, Response } from 'express';
import cors from 'cors';
import { env } from './config/env.js';
import { InMemoryAuthRepository, IAuthRepository } from './modules/auth/auth.repository.js';
import { AuthService } from './modules/auth/auth.service.js';
import { AuthController } from './modules/auth/auth.controller.js';
import { createAuthRouter } from './modules/auth/auth.routes.js';
import { InMemoryPresenceRepository, IPresenceRepository } from './modules/presence/presence.repository.js';
import { PresenceService } from './modules/presence/presence.service.js';
import { PresenceController } from './modules/presence/presence.controller.js';
import { createPresenceRouter } from './modules/presence/presence.routes.js';
import { ChallengeService } from './modules/challenge/challenge.service.js';
import { ChallengeController } from './modules/challenge/challenge.controller.js';
import { createChallengeRouter } from './modules/challenge/challenge.routes.js';
import { MockNetworkProvider, INetworkEvidenceProvider } from './modules/network/index.js';
import {
  IAdminRepository,
  InMemoryAdminRepository,
  AdminService,
  AdminController,
  createAdminRouter,
  createCurfewPublicRouter,
} from './modules/admin/index.js';
import { authenticate } from './common/middleware/auth.middleware.js';
import { requireRoles } from './common/middleware/rbac.middleware.js';
import { errorHandler } from './common/middleware/errorHandler.middleware.js';

import {
  ICurfewEvaluationRepository,
  InMemoryCurfewEvaluationRepository,
  CurfewEvaluationService,
  CurfewEvaluationController,
} from './modules/curfew-evaluation/index.js';
import {
  IAuditRepository,
  InMemoryAuditRepository,
  AuditService,
} from './modules/audit/index.js';
import {
  ReportingService,
  ReportingController,
  createReportingRouter,
} from './modules/reporting/index.js';

export function createApp(
  customAuthRepo?: IAuthRepository,
  customPresenceRepo?: IPresenceRepository,
  customNetworkProvider?: INetworkEvidenceProvider,
  customAdminRepo?: IAdminRepository,
  customCurfewEvalRepo?: ICurfewEvaluationRepository,
  customAuditRepo?: IAuditRepository
): Express {
  const app = express();

  // Reverse proxy IP resolution
  app.set('trust proxy', 1);

  // Basic Middlewares
  app.use(cors({ origin: env.CORS_ORIGIN }));
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Dependency Injection
  const auditRepo = customAuditRepo || new InMemoryAuditRepository();
  const auditService = new AuditService(auditRepo);

  const authRepo = customAuthRepo || new InMemoryAuthRepository();
  const authService = new AuthService(authRepo, auditService);
  const authController = new AuthController(authService);
  const authRouter = createAuthRouter(authController);

  const networkProvider = customNetworkProvider || new MockNetworkProvider();
  const presenceRepo = customPresenceRepo || new InMemoryPresenceRepository();
  const presenceService = new PresenceService(presenceRepo, authRepo, networkProvider);
  const presenceController = new PresenceController(presenceService);
  const presenceRouter = createPresenceRouter(presenceController);

  const challengeService = new ChallengeService(presenceRepo, authRepo);
  const challengeController = new ChallengeController(challengeService);
  const challengeRouter = createChallengeRouter(challengeController);

  const adminRepo = customAdminRepo || new InMemoryAdminRepository(auditRepo);
  const adminService = new AdminService(adminRepo, authRepo, presenceRepo, auditService);
  const adminController = new AdminController(adminService);

  const curfewEvalRepo = customCurfewEvalRepo || new InMemoryCurfewEvaluationRepository();
  const curfewEvalService = new CurfewEvaluationService(
    adminRepo,
    authRepo,
    presenceRepo,
    curfewEvalRepo
  );
  const curfewEvalController = new CurfewEvaluationController(curfewEvalService);

  const adminRouter = createAdminRouter(adminController, curfewEvalController);
  const curfewPublicRouter = createCurfewPublicRouter(adminController);

  const reportingService = new ReportingService(
    adminRepo,
    authRepo,
    presenceRepo,
    curfewEvalRepo,
    auditRepo
  );
  const reportingController = new ReportingController(reportingService);
  const reportingRouter = createReportingRouter(reportingController);

  // Mount Auth routes (Support both /auth and /api/v1/auth)
  app.use('/auth', authRouter);
  app.use('/api/v1/auth', authRouter);

  // Mount Presence routes
  app.use('/presence', presenceRouter);
  app.use('/api/v1/presence', presenceRouter);

  // Mount Verification Challenge routes
  app.use('/verification/challenge', challengeRouter);
  app.use('/api/v1/verification/challenge', challengeRouter);
  app.use('/challenge', challengeRouter);
  app.use('/api/v1/challenge', challengeRouter);

  // Mount Admin / Warden routes
  app.use('/admin', adminRouter);
  app.use('/api/v1/admin', adminRouter);

  // Mount Executive & Audit Reporting routes
  app.use('/admin/reports', reportingRouter);
  app.use('/api/v1/admin/reports', reportingRouter);
  app.use('/reports', reportingRouter);
  app.use('/api/v1/reports', reportingRouter);

  // Mount Curfew routes
  app.use('/curfew', curfewPublicRouter);
  app.use('/api/v1/curfew', curfewPublicRouter);

  // Root Endpoint - Interactive Developer Landing & API Status
  app.get('/', (req: Request, res: Response) => {
    if (req.accepts('html')) {
      res.type('html').send(`
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Hostel Curfew & Presence Verification API</title>
  <style>
    :root {
      --primary: #1e3a8a;
      --primary-light: #3b82f6;
      --bg: #f8fafc;
      --card-bg: #ffffff;
      --text: #0f172a;
      --muted: #64748b;
      --border: #e2e8f0;
      --success: #16a34a;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      background: var(--bg);
      color: var(--text);
      margin: 0;
      padding: 32px 16px;
      display: flex;
      justify-content: center;
    }
    .container {
      max-width: 860px;
      width: 100%;
    }
    .header {
      background: var(--card-bg);
      padding: 28px;
      border-radius: 12px;
      border: 1px solid var(--border);
      box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);
      margin-bottom: 24px;
    }
    .badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      background: #dcfce7;
      color: #166534;
      padding: 4px 10px;
      border-radius: 9999px;
      font-size: 13px;
      font-weight: 600;
    }
    .badge-dot {
      width: 8px;
      height: 8px;
      background: #16a34a;
      border-radius: 50%;
    }
    h1 {
      margin: 14px 0 6px;
      color: var(--primary);
      font-size: 26px;
    }
    p {
      color: var(--muted);
      margin: 0;
      line-height: 1.5;
    }
    .card {
      background: var(--card-bg);
      padding: 24px;
      border-radius: 12px;
      border: 1px solid var(--border);
      margin-bottom: 20px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.02);
    }
    h2 {
      margin-top: 0;
      font-size: 18px;
      color: var(--primary);
      border-bottom: 1px solid var(--border);
      padding-bottom: 10px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 14px;
    }
    th, td {
      text-align: left;
      padding: 10px 12px;
      border-bottom: 1px solid var(--border);
    }
    th {
      color: var(--muted);
      font-weight: 600;
      background: #f8fafc;
    }
    .method {
      display: inline-block;
      padding: 2px 6px;
      border-radius: 4px;
      font-weight: 700;
      font-size: 11px;
      font-family: monospace;
    }
    .method-get { background: #e0f2fe; color: #0369a1; }
    .method-post { background: #dcfce7; color: #15803d; }
    code {
      background: #f1f5f9;
      padding: 2px 6px;
      border-radius: 4px;
      font-family: Consolas, monospace;
      font-size: 13px;
    }
    .note-box {
      background: #eff6ff;
      border-left: 4px solid var(--primary-light);
      padding: 14px 16px;
      border-radius: 0 8px 8px 0;
      font-size: 14px;
      color: #1e40af;
      margin-top: 16px;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="badge">
        <span class="badge-dot"></span>
        API Service Online (Port 4000)
      </div>
      <h1>Hostel Curfew & Presence Verification API</h1>
      <p>Secure Node.js & TypeScript Backend Service providing RBAC, short-lived anti-replay nonces, and multi-factor curfew orchestration.</p>
      
      <div class="note-box">
        <strong>Looking for the User Interface?</strong><br/>
        This port runs the <strong>REST API server</strong>. 
        The resident mobile app is in <code>apps/mobile</code> (Flutter), and the warden/admin dashboard is in <code>apps/admin</code> (React).
      </div>
    </div>

    <div class="card">
      <h2>Active Core Endpoints</h2>
      <table>
        <thead>
          <tr>
            <th>Method</th>
            <th>Endpoint</th>
            <th>Role Required</th>
            <th>Description</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><span class="method method-get">GET</span></td>
            <td><a href="/health"><code>/health</code></a></td>
            <td>Public</td>
            <td>Health check & server timestamp</td>
          </tr>
          <tr>
            <td><span class="method method-post">POST</span></td>
            <td><code>/auth/login</code></td>
            <td>Public (Rate limited)</td>
            <td>Authenticate resident, warden, or admin credentials</td>
          </tr>
          <tr>
            <td><span class="method method-post">POST</span></td>
            <td><code>/auth/refresh</code></td>
            <td>Public</td>
            <td>Rotating refresh token exchange</td>
          </tr>
          <tr>
            <td><span class="method method-post">POST</span></td>
            <td><code>/auth/activate</code></td>
            <td>Public</td>
            <td>Activate resident account via token</td>
          </tr>
          <tr>
            <td><span class="method method-post">POST</span></td>
            <td><code>/auth/device/register</code></td>
            <td><code>RESIDENT</code></td>
            <td>Register & bind physical hardware device</td>
          </tr>
          <tr>
            <td><span class="method method-get">GET</span></td>
            <td><code>/resident/home</code></td>
            <td><code>RESIDENT</code></td>
            <td>Resident curfew & presence portal</td>
          </tr>
          <tr>
            <td><span class="method method-get">GET</span></td>
            <td><code>/warden/roster</code></td>
            <td><code>WARDEN</code>, <code>ADMIN</code></td>
            <td>Warden curfew monitoring feed</td>
          </tr>
          <tr>
            <td><span class="method method-get">GET</span></td>
            <td><code>/admin/dashboard</code></td>
            <td><code>ADMIN</code>, <code>SUPER_ADMIN</code></td>
            <td>Administrative governance dashboard</td>
          </tr>
        </tbody>
      </table>
    </div>

    <div class="card">
      <h2>Seeded Test Credentials</h2>
      <table>
        <thead>
          <tr>
            <th>Role</th>
            <th>Email</th>
            <th>Password</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><strong>Super Admin</strong></td>
            <td><code>admin@campus.edu</code></td>
            <td><code>AdminSecurePass!2026</code></td>
            <td>Active</td>
          </tr>
          <tr>
            <td><strong>Warden</strong></td>
            <td><code>warden.sharma@hostel.edu</code></td>
            <td><code>WardenSecurePass!2026</code></td>
            <td>Active</td>
          </tr>
          <tr>
            <td><strong>Resident (Active)</strong></td>
            <td><code>aarav.patel@student.edu</code></td>
            <td><code>SecureStudentPass!2026</code></td>
            <td>Active (Bound Device)</td>
          </tr>
          <tr>
            <td><strong>Resident (Pending)</strong></td>
            <td><code>rohan.verma@student.edu</code></td>
            <td><em>Use Token: <code>ACTIVATE_ROHAN_2026_TOKEN</code></em></td>
            <td>Pending Activation</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</body>
</html>
      `);
      return;
    }

    res.status(200).json({
      service: 'Smart Hostel Curfew & Presence Verification API',
      status: 'online',
      version: '1.0.0',
      timestamp: new Date().toISOString(),
      documentation: 'docs/api-specification.md',
    });
  });

  // Health check endpoint
  app.get('/health', (_req: Request, res: Response) => {
    res.status(200).json({ status: 'healthy', timestamp: new Date().toISOString() });
  });

  // ----------------------------------------------------------------------------
  // Protected Role-Restricted Endpoints (Used for RBAC & Role-Escalation Testing)
  // ----------------------------------------------------------------------------
  
  // Administrator Only Route
  app.get(
    '/admin/dashboard',
    authenticate,
    requireRoles('ADMIN', 'SUPER_ADMIN'),
    (req: Request, res: Response) => {
      res.status(200).json({
        message: 'Welcome to the Admin Dashboard',
        user: req.user,
      });
    }
  );

  // Warden & Admin Route
  app.get(
    '/warden/roster',
    authenticate,
    requireRoles('WARDEN', 'ADMIN', 'SUPER_ADMIN'),
    (req: Request, res: Response) => {
      res.status(200).json({
        message: 'Hostel Curfew Roster',
        user: req.user,
      });
    }
  );

  // Resident Only Route
  app.get(
    '/resident/home',
    authenticate,
    requireRoles('RESIDENT'),
    (req: Request, res: Response) => {
      res.status(200).json({
        message: 'Resident Home Portal',
        user: req.user,
      });
    }
  );

  // Global Error Handler
  app.use(errorHandler);

  return app;
}
