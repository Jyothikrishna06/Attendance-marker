import express, { Express, Request, Response } from 'express';
import cors from 'cors';
import { env } from './config/env.js';
import { InMemoryAuthRepository, IAuthRepository } from './modules/auth/auth.repository.js';
import { AuthService } from './modules/auth/auth.service.js';
import { AuthController } from './modules/auth/auth.controller.js';
import { createAuthRouter } from './modules/auth/auth.routes.js';
import { authenticate } from './common/middleware/auth.middleware.js';
import { requireRoles } from './common/middleware/rbac.middleware.js';
import { errorHandler } from './common/middleware/errorHandler.middleware.js';

export function createApp(customAuthRepo?: IAuthRepository): Express {
  const app = express();

  // Basic Middlewares
  app.use(cors({ origin: env.CORS_ORIGIN }));
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Dependency Injection
  const authRepo = customAuthRepo || new InMemoryAuthRepository();
  const authService = new AuthService(authRepo);
  const authController = new AuthController(authService);
  const authRouter = createAuthRouter(authController);

  // Mount Auth routes (Support both /auth and /api/v1/auth)
  app.use('/auth', authRouter);
  app.use('/api/v1/auth', authRouter);

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
