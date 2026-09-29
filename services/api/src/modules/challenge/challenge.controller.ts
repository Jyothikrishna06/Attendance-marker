import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { ChallengeService } from './challenge.service.js';
import { UnauthorizedError } from '../../common/errors.js';

export const generateChallengeSchema = z.object({
  deviceId: z.string().optional(),
  ttlSeconds: z.number().int().min(5).max(300).optional(),
  clientMetadata: z.record(z.unknown()).optional(),
  clientTimestamp: z.string().optional(), // Ignored for validation logic
});

export const verifyChallengeSchema = z.object({
  challengeId: z.string().uuid('Challenge ID must be a valid UUID'),
  challengeNonce: z.string().min(16, 'Challenge nonce is required'),
  biometricConfirmed: z.boolean().optional(),
  networkMetadata: z.record(z.unknown()).optional(),
  idempotencyKey: z.string().optional(),
  clientTimestamp: z.string().optional(), // Ignored for validation logic
});

export class ChallengeController {
  constructor(private readonly challengeService: ChallengeService) {}

  generateChallenge = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        throw new UnauthorizedError('Authentication required');
      }
      const data = generateChallengeSchema.parse(req.body || {});
      const result = await this.challengeService.generateChallenge(req.user.userId, {
        deviceId: data.deviceId,
        ttlSeconds: data.ttlSeconds,
        clientMetadata: data.clientMetadata,
      });

      res.status(200).json({
        data: result,
        message: 'Verification challenge generated. Must be submitted before expiration.',
      });
    } catch (err) {
      next(err);
    }
  };

  verifyChallenge = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        throw new UnauthorizedError('Authentication required');
      }
      const data = verifyChallengeSchema.parse(req.body);
      const idempotencyKey = (req.headers['idempotency-key'] as string) || data.idempotencyKey;

      const result = await this.challengeService.verifyChallenge(req.user.userId, {
        challengeId: data.challengeId,
        challengeNonce: data.challengeNonce,
        biometricConfirmed: data.biometricConfirmed,
        networkMetadata: data.networkMetadata,
        idempotencyKey,
      });

      res.status(200).json({
        data: result,
        message: 'Verification challenge validated and consumed successfully.',
      });
    } catch (err) {
      next(err);
    }
  };
}
