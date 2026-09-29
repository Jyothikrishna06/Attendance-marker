import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { AuthService } from './auth.service.js';
import { UnauthorizedError } from '../../common/errors.js';

// Request Validation Schemas
export const loginSchema = z.object({
  email: z.string().email('Valid email is required'),
  password: z.string().min(8, 'Password must be at least 8 characters long'),
});

export const refreshSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token is required'),
});

export const logoutSchema = z.object({
  refreshToken: z.string().optional(),
});

export const activateSchema = z.object({
  email: z.string().email('Valid email is required'),
  activationToken: z.string().min(6, 'Activation token is required'),
  newPassword: z.string().min(8, 'New password must be at least 8 characters long'),
});

export const registerDeviceSchema = z.object({
  deviceIdentifier: z.string().min(8, 'Hardware device identifier/fingerprint is required'),
  deviceModel: z.string().min(2, 'Device model is required'),
  osName: z.enum(['ANDROID', 'IOS', 'TEST_OS']),
  osVersion: z.string().min(1, 'OS version is required'),
});

export class AuthController {
  constructor(private readonly authService: AuthService) {}

  login = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const data = loginSchema.parse(req.body);
      const result = await this.authService.login(data.email, data.password);
      res.status(200).json({
        data: result,
        message: 'Authentication successful',
      });
    } catch (err) {
      next(err);
    }
  };

  refresh = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const data = refreshSchema.parse(req.body);
      const result = await this.authService.refresh(data.refreshToken);
      res.status(200).json({
        data: result,
        message: 'Token successfully refreshed',
      });
    } catch (err) {
      next(err);
    }
  };

  logout = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const data = logoutSchema.parse(req.body);
      const result = await this.authService.logout(data.refreshToken);
      res.status(200).json({
        data: result,
      });
    } catch (err) {
      next(err);
    }
  };

  activate = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const data = activateSchema.parse(req.body);
      const result = await this.authService.activate(data.email, data.activationToken, data.newPassword);
      res.status(200).json({
        data: result,
      });
    } catch (err) {
      next(err);
    }
  };

  registerDevice = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        throw new UnauthorizedError('Authentication required to register device');
      }
      const data = registerDeviceSchema.parse(req.body);
      const device = await this.authService.registerDevice(req.user.userId, data);
      res.status(201).json({
        data: { device },
        message: 'Device registered successfully',
      });
    } catch (err) {
      next(err);
    }
  };
}
