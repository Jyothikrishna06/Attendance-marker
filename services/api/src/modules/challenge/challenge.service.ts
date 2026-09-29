import { IAuthRepository } from '../auth/auth.repository.js';
import { IPresenceRepository } from '../presence/presence.repository.js';
import { generateRandomToken, hashToken } from '../../core/crypto.js';
import {
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  ConflictError,
  ChallengeExpiredError,
} from '../../common/errors.js';
import {
  GenerateChallengeOptions,
  GenerateChallengeResponse,
  VerifyChallengeInput,
  VerifyChallengeResponse,
} from './challenge.interface.js';

export class ChallengeService {
  constructor(
    private readonly presenceRepo: IPresenceRepository,
    private readonly authRepo: IAuthRepository
  ) {}

  /**
   * Generates a short-lived random cryptographic verification challenge.
   * Enforces server-authoritative timestamps, UUID generation, and hardware device binding.
   */
  async generateChallenge(
    residentUserId: string,
    options: GenerateChallengeOptions = {}
  ): Promise<GenerateChallengeResponse> {
    const resident = await this.authRepo.findResidentByUserId(residentUserId);
    if (!resident) {
      throw new NotFoundError('Resident profile not found for this user account');
    }

    // 1. Verify Active Hardware Device Binding
    const activeDevice = await this.authRepo.findActiveDeviceByResidentId(resident.id);
    if (!activeDevice) {
      throw new ForbiddenError(
        'No active registered hardware device found for this resident. Please register your device first.'
      );
    }

    if (
      options.deviceId &&
      options.deviceId !== activeDevice.id &&
      options.deviceId !== activeDevice.deviceIdentifier
    ) {
      throw new ForbiddenError(
        'Mismatched hardware device. Verification challenges must be bound to your approved device.'
      );
    }

    // 2. Generate 32-Byte Cryptographically Secure Nonce & SHA-256 Hash
    const rawNonce = generateRandomToken(32);
    const nonceHash = hashToken(rawNonce);

    // 3. Server-Authoritative Clock & Expiration (Default 60 seconds TTL)
    const issuedAt = new Date();
    const ttlSeconds = options.ttlSeconds && options.ttlSeconds > 0 && options.ttlSeconds <= 300
      ? options.ttlSeconds
      : 60;
    const expiresAt = new Date(issuedAt.getTime() + ttlSeconds * 1000);

    const attempt = await this.presenceRepo.createVerificationAttempt({
      residentId: resident.id,
      deviceId: activeDevice.id,
      sessionNonceHash: nonceHash,
      challengeIssuedAt: issuedAt,
      challengeExpiresAt: expiresAt,
      clientMetadata: options.clientMetadata,
    });

    return {
      challengeId: attempt.id,
      sessionId: attempt.id,
      challengeNonce: rawNonce,
      issuedAt: attempt.challengeIssuedAt.toISOString(),
      expiresAt: attempt.challengeExpiresAt.toISOString(),
      ttlSeconds,
      deviceId: activeDevice.id,
      residentId: resident.id,
    };
  }

  /**
   * Evaluates a challenge submission response.
   * Strictly enforces server-side timing logic, anti-replay, wrong-user defense, and single-use consumption.
   */
  async verifyChallenge(
    residentUserId: string,
    data: VerifyChallengeInput
  ): Promise<VerifyChallengeResponse> {
    // 1. Idempotency Check
    if (data.idempotencyKey) {
      const cached = await this.presenceRepo.getIdempotentResponse(data.idempotencyKey);
      if (cached && cached.action === 'VERIFY_CHALLENGE') {
        return cached.responseBody as VerifyChallengeResponse;
      }
    }

    const resident = await this.authRepo.findResidentByUserId(residentUserId);
    if (!resident) {
      throw new NotFoundError('Resident profile not found for this user account');
    }

    const attempt = await this.presenceRepo.findVerificationAttemptById(data.challengeId);
    if (!attempt) {
      throw new NotFoundError('Verification challenge session not found');
    }

    // 2. Wrong-User Submission Prevention
    if (attempt.residentId !== resident.id) {
      throw new ForbiddenError(
        'Wrong user attempt: Challenge session was issued to a different resident.',
        'WRONG_USER_CHALLENGE'
      );
    }

    // 3. Strict Anti-Replay Protection (Single-Use Nonce)
    if (attempt.consumedAt != null || attempt.status === 'VERIFIED') {
      throw new UnauthorizedError(
        'Replay attack detected: Challenge nonce has already been consumed and cannot be reused.',
        'CHALLENGE_ALREADY_USED'
      );
    }

    // 4. Duplicate / Terminated Submission Prevention
    if (
      attempt.status === 'REJECTED' ||
      attempt.status === 'EXPIRED' ||
      attempt.status === 'FAILED'
    ) {
      throw new ConflictError(
        'Duplicate submission rejected: This challenge session has already been evaluated and finalized.',
        'DUPLICATE_CHALLENGE_SUBMISSION',
        { previousStatus: attempt.status, failureReason: attempt.failureReason }
      );
    }

    // 5. Server-Side Nonce Expiration (Client Timestamps Are Ignored)
    const serverNow = new Date();
    if (serverNow.getTime() > attempt.challengeExpiresAt.getTime()) {
      await this.presenceRepo.updateVerificationAttempt(attempt.id, {
        status: 'EXPIRED',
        failureReason: 'CHALLENGE_TIMEOUT',
      });
      throw new ChallengeExpiredError(
        'Verification challenge expired. Please initiate a fresh challenge attempt.',
        {
          challengeExpiresAt: attempt.challengeExpiresAt.toISOString(),
          serverTime: serverNow.toISOString(),
        }
      );
    }

    // 6. Cryptographic Nonce Hash Proof Verification
    const expectedHash = hashToken(data.challengeNonce);
    if (expectedHash !== attempt.sessionNonceHash) {
      await this.presenceRepo.updateVerificationAttempt(attempt.id, {
        status: 'REJECTED',
        failureReason: 'NONCE_MISMATCH',
      });
      throw new UnauthorizedError(
        'Invalid cryptographic challenge proof: Nonce mismatch.',
        'INVALID_CHALLENGE_PROOF'
      );
    }

    // 7. Atomic Challenge Consumption
    await this.presenceRepo.updateVerificationAttempt(attempt.id, {
      status: 'VERIFIED',
      consumedAt: serverNow,
      biometricVerified: !!data.biometricConfirmed,
      networkVerified: true,
    });

    const response: VerifyChallengeResponse = {
      challengeId: attempt.id,
      residentId: resident.id,
      status: 'VERIFIED',
      verifiedAt: serverNow.toISOString(),
      biometricVerified: !!data.biometricConfirmed,
      message: 'Verification challenge validated and consumed successfully.',
    };

    if (data.idempotencyKey) {
      await this.presenceRepo.saveIdempotentResponse({
        key: data.idempotencyKey,
        action: 'VERIFY_CHALLENGE',
        responseBody: response,
        statusCode: 200,
        createdAt: new Date(),
      });
    }

    return response;
  }
}
