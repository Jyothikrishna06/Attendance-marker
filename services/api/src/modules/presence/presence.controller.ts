import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { PresenceService } from './presence.service.js';
import { UnauthorizedError } from '../../common/errors.js';

export const startEntrySchema = z.object({
  deviceId: z.string().optional(),
  clientMetadata: z.record(z.unknown()).optional(),
  clientTimestamp: z.string().optional(), // Observational only
});

export const verifyEntrySchema = z.object({
  sessionId: z.string().uuid('Session ID must be a valid UUID'),
  challengeNonce: z.string().min(16, 'Challenge nonce string is required'),
  biometricConfirmed: z.boolean(),
  networkMetadata: z.record(z.unknown()).optional(),
  idempotencyKey: z.string().optional(),
  clientTimestamp: z.string().optional(), // Observational only
});

export const exitSchema = z.object({
  reason: z.string().max(250).optional(),
  idempotencyKey: z.string().optional(),
  clientTimestamp: z.string().optional(), // Observational only
});

export class PresenceController {
  constructor(private readonly presenceService: PresenceService) {}

  startEntry = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        throw new UnauthorizedError('Authentication required');
      }
      const data = startEntrySchema.parse(req.body);
      const result = await this.presenceService.startEntry(
        req.user.userId,
        data.deviceId,
        data.clientMetadata
      );
      res.status(200).json({
        data: result,
        message: 'Verification challenge issued. Complete challenge before expiry.',
      });
    } catch (err) {
      next(err);
    }
  };

  verifyEntry = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        throw new UnauthorizedError('Authentication required');
      }
      const data = verifyEntrySchema.parse(req.body);
      const idempotencyKey = (req.headers['idempotency-key'] as string) || data.idempotencyKey;
      const clientIp =
        (req.headers['x-forwarded-for'] as string)?.split(',')[0].trim() ||
        req.ip ||
        req.socket.remoteAddress ||
        '127.0.0.1';

      const result = await this.presenceService.verifyEntry(req.user.userId, {
        sessionId: data.sessionId,
        challengeNonce: data.challengeNonce,
        biometricConfirmed: data.biometricConfirmed,
        networkMetadata: data.networkMetadata,
        idempotencyKey,
        clientIp,
        headers: req.headers,
      });

      res.status(200).json({
        data: result,
        message: 'Presence verified successfully: Inside Hostel',
      });
    } catch (err) {
      next(err);
    }
  };

  recordExit = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        throw new UnauthorizedError('Authentication required');
      }
      const data = exitSchema.parse(req.body);
      const idempotencyKey = (req.headers['idempotency-key'] as string) || data.idempotencyKey;

      const result = await this.presenceService.recordExit(req.user.userId, {
        reason: data.reason,
        idempotencyKey,
        clientTimestamp: data.clientTimestamp,
      });

      res.status(200).json({
        data: result,
        message: 'Exit recorded successfully: Outside Hostel',
      });
    } catch (err) {
      next(err);
    }
  };

  getMyPresence = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        throw new UnauthorizedError('Authentication required');
      }
      const result = await this.presenceService.getResidentPresence(req.user.userId);
      res.status(200).json({
        data: result,
      });
    } catch (err) {
      next(err);
    }
  };

  getStatus = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        throw new UnauthorizedError('Authentication required');
      }
      const residentId = req.query.residentId as string | undefined;
      const hostelId = req.query.hostelId as string | undefined;

      const result = await this.presenceService.getPresenceStatus(req.user, {
        residentId,
        hostelId,
      });

      res.status(200).json({
        data: result,
      });
    } catch (err) {
      next(err);
    }
  };
}
