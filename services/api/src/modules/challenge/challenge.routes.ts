import { Router } from 'express';
import { ChallengeController } from './challenge.controller.js';
import { authenticate } from '../../common/middleware/auth.middleware.js';
import { requireRoles } from '../../common/middleware/rbac.middleware.js';
import { createRateLimiter } from '../../common/middleware/rateLimiter.middleware.js';

export function createChallengeRouter(controller: ChallengeController): Router {
  const router = Router();

  // Rate Limiter: Max 10 challenge generations per minute to prevent challenge flooding / DoS
  const challengeGenerateLimiter = createRateLimiter({
    windowMs: 60 * 1000,
    maxAttempts: 10,
    message: 'Too many challenge generation attempts. Please wait before requesting another challenge.',
    keyGenerator: (req) => `${req.user?.userId || req.ip}-challenge-gen`,
  });

  // Rate Limiter: Max 15 challenge verifications per minute to prevent brute-forcing nonces
  const challengeVerifyLimiter = createRateLimiter({
    windowMs: 60 * 1000,
    maxAttempts: 15,
    message: 'Too many challenge verification attempts. Please wait before retrying.',
    keyGenerator: (req) => `${req.user?.userId || req.ip}-challenge-verify`,
  });

  // All verification challenge endpoints require resident authentication
  router.use(authenticate);
  router.use(requireRoles('RESIDENT'));

  // Core challenge routes
  router.post('/generate', challengeGenerateLimiter, controller.generateChallenge);
  router.post('/verify', challengeVerifyLimiter, controller.verifyChallenge);
  router.post('/respond', challengeVerifyLimiter, controller.verifyChallenge); // Endpoint alias

  return router;
}
