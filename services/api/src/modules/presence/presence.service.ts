import { IPresenceRepository } from './presence.repository.js';
import { IAuthRepository } from '../auth/auth.repository.js';
import { generateRandomToken, hashToken } from '../../core/crypto.js';
import {
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  ConflictError,
  ValidationError,
} from '../../common/errors.js';
import { AccessTokenPayload, PresenceEvent } from '../../common/types.js';

export interface StartEntryResponse {
  sessionId: string;
  challengeNonce: string;
  challengeIssuedAt: string;
  challengeExpiresAt: string;
  deviceId: string;
  residentId: string;
}

export interface VerifyEntryResponse {
  eventId: string;
  residentId: string;
  eventType: 'ENTRY';
  status: 'VERIFIED_INSIDE';
  serverTimestamp: string;
  curfewDate: string;
  sessionId: string;
}

export interface ExitResponse {
  eventId: string;
  residentId: string;
  eventType: 'EXIT';
  status: 'VERIFIED_OUTSIDE';
  serverTimestamp: string;
  curfewDate: string;
}

export class PresenceService {
  constructor(
    private readonly presenceRepo: IPresenceRepository,
    private readonly authRepo: IAuthRepository
  ) {}

  /**
   * Initiates a presence entry verification session with a short-lived cryptographic challenge.
   */
  async startEntry(
    residentUserId: string,
    deviceIdRequested?: string,
    clientMetadata?: Record<string, unknown>
  ): Promise<StartEntryResponse> {
    const resident = await this.authRepo.findResidentByUserId(residentUserId);
    if (!resident) {
      throw new NotFoundError('Resident profile not found for this user account');
    }

    // 1. Verify Resident has an active registered device
    const activeDevice = await this.authRepo.findActiveDeviceByResidentId(resident.id);
    if (!activeDevice) {
      throw new ForbiddenError(
        'No active registered hardware device found for this resident. Please register your device first.'
      );
    }

    if (deviceIdRequested && deviceIdRequested !== activeDevice.id && deviceIdRequested !== activeDevice.deviceIdentifier) {
      throw new ForbiddenError(
        'Mismatched hardware device. Presence verification must be initiated from your approved device.'
      );
    }

    // 2. Prevent Duplicate Active Entries: check if already verified inside
    const latestEvent = await this.presenceRepo.findLatestPresenceEvent(resident.id);
    if (latestEvent && latestEvent.eventType === 'ENTRY' && latestEvent.status === 'VERIFIED_INSIDE') {
      throw new ConflictError(
        'Duplicate active entry rejected: Resident is currently verified inside the hostel. An exit event must precede a new entry.'
      );
    }

    // 3. Issue Cryptographic Anti-Replay Nonce with 60s TTL
    const rawNonce = generateRandomToken(32);
    const nonceHash = hashToken(rawNonce);

    const now = new Date();
    const expiresAt = new Date(now.getTime() + 60 * 1000); // 60 seconds TTL

    const attempt = await this.presenceRepo.createVerificationAttempt({
      residentId: resident.id,
      deviceId: activeDevice.id,
      sessionNonceHash: nonceHash,
      challengeIssuedAt: now,
      challengeExpiresAt: expiresAt,
      clientMetadata,
    });

    return {
      sessionId: attempt.id,
      challengeNonce: rawNonce,
      challengeIssuedAt: attempt.challengeIssuedAt.toISOString(),
      challengeExpiresAt: attempt.challengeExpiresAt.toISOString(),
      deviceId: activeDevice.id,
      residentId: resident.id,
    };
  }

  /**
   * Validates the multi-factor challenge response, enforces anti-replay, and creates an authoritative entry record.
   */
  async verifyEntry(
    residentUserId: string,
    data: {
      sessionId: string;
      challengeNonce: string;
      biometricConfirmed: boolean;
      networkMetadata?: Record<string, unknown>;
      idempotencyKey?: string;
    }
  ): Promise<VerifyEntryResponse> {
    // 1. Idempotency Check
    if (data.idempotencyKey) {
      const cached = await this.presenceRepo.getIdempotentResponse(data.idempotencyKey);
      if (cached && cached.action === 'VERIFY_ENTRY') {
        return cached.responseBody as VerifyEntryResponse;
      }
    }

    const resident = await this.authRepo.findResidentByUserId(residentUserId);
    if (!resident) {
      throw new NotFoundError('Resident profile not found for this user account');
    }

    const attempt = await this.presenceRepo.findVerificationAttemptById(data.sessionId);
    if (!attempt) {
      throw new NotFoundError('Verification session challenge not found');
    }

    // 2. Security Check: Session ownership
    if (attempt.residentId !== resident.id) {
      throw new ForbiddenError('Verification session was issued to a different resident.');
    }

    // 3. Security Check: Single-use anti-replay (already consumed)
    if (attempt.consumedAt != null || attempt.status === 'VERIFIED') {
      throw new UnauthorizedError(
        'Replay attack detected: Challenge nonce has already been consumed and cannot be reused.',
        'CHALLENGE_ALREADY_USED'
      );
    }

    // 4. Security Check: Expiration
    const now = new Date();
    if (now.getTime() > attempt.challengeExpiresAt.getTime()) {
      await this.presenceRepo.updateVerificationAttempt(attempt.id, {
        status: 'EXPIRED',
        failureReason: 'CHALLENGE_TIMEOUT',
      });
      throw new ValidationError(
        'Verification challenge expired. Please initiate a fresh verification attempt.',
        { challengeExpiresAt: attempt.challengeExpiresAt.toISOString(), serverTime: now.toISOString() }
      );
    }

    // 5. Security Check: Cryptographic Nonce Hash Verification
    const expectedHash = hashToken(data.challengeNonce);
    if (expectedHash !== attempt.sessionNonceHash) {
      await this.presenceRepo.updateVerificationAttempt(attempt.id, {
        status: 'REJECTED',
        failureReason: 'NONCE_MISMATCH',
      });
      throw new UnauthorizedError('Invalid cryptographic challenge proof', 'INVALID_CHALLENGE_PROOF');
    }

    // 6. Security Check: Native Biometric Confirmation Signal
    if (!data.biometricConfirmed) {
      await this.presenceRepo.updateVerificationAttempt(attempt.id, {
        status: 'FAILED',
        failureReason: 'BIOMETRIC_REJECTED',
      });
      throw new UnauthorizedError(
        'Device biometric confirmation was rejected or canceled.',
        'BIOMETRIC_FAILED'
      );
    }

    // 7. Prevent Duplicate Active Entries at time of verification
    const latestEvent = await this.presenceRepo.findLatestPresenceEvent(resident.id);
    if (latestEvent && latestEvent.eventType === 'ENTRY' && latestEvent.status === 'VERIFIED_INSIDE') {
      throw new ConflictError(
        'Duplicate active entry rejected: Resident is already verified inside the hostel.'
      );
    }

    // 8. Authoritative Server Clock & Event Generation
    const serverTimestamp = new Date();
    const curfewDate = serverTimestamp.toISOString().split('T')[0];

    // Atomically consume challenge
    await this.presenceRepo.updateVerificationAttempt(attempt.id, {
      status: 'VERIFIED',
      consumedAt: serverTimestamp,
      biometricVerified: true,
      networkVerified: true,
    });

    // Create immutable PresenceEvent
    const presenceEvent = await this.presenceRepo.createPresenceEvent({
      residentId: resident.id,
      eventType: 'ENTRY',
      source: 'VERIFICATION_SESSION',
      verificationAttemptId: attempt.id,
      serverTimestamp,
      curfewDate,
      status: 'VERIFIED_INSIDE',
      networkEvidence: data.networkMetadata || {},
    });

    const response: VerifyEntryResponse = {
      eventId: presenceEvent.id,
      residentId: resident.id,
      eventType: 'ENTRY',
      status: 'VERIFIED_INSIDE',
      serverTimestamp: serverTimestamp.toISOString(),
      curfewDate,
      sessionId: attempt.id,
    };

    if (data.idempotencyKey) {
      await this.presenceRepo.saveIdempotentResponse({
        key: data.idempotencyKey,
        action: 'VERIFY_ENTRY',
        responseBody: response,
        statusCode: 200,
        createdAt: new Date(),
      });
    }

    return response;
  }

  /**
   * Records an authoritative hostel exit event.
   */
  async recordExit(
    residentUserId: string,
    data: {
      reason?: string;
      idempotencyKey?: string;
      clientTimestamp?: string;
    }
  ): Promise<ExitResponse> {
    if (data.idempotencyKey) {
      const cached = await this.presenceRepo.getIdempotentResponse(data.idempotencyKey);
      if (cached && cached.action === 'RECORD_EXIT') {
        return cached.responseBody as ExitResponse;
      }
    }

    const resident = await this.authRepo.findResidentByUserId(residentUserId);
    if (!resident) {
      throw new NotFoundError('Resident profile not found for this user account');
    }

    const latestEvent = await this.presenceRepo.findLatestPresenceEvent(resident.id);
    if (latestEvent && latestEvent.eventType === 'EXIT' && latestEvent.status === 'VERIFIED_OUTSIDE') {
      throw new ConflictError('Resident is already recorded outside the hostel.');
    }

    // Authoritative Server Clock
    const serverTimestamp = new Date();
    const curfewDate = serverTimestamp.toISOString().split('T')[0];

    const presenceEvent = await this.presenceRepo.createPresenceEvent({
      residentId: resident.id,
      eventType: 'EXIT',
      source: 'VERIFICATION_SESSION',
      serverTimestamp,
      curfewDate,
      status: 'VERIFIED_OUTSIDE',
      networkEvidence: data.reason ? { reason: data.reason } : {},
    });

    const response: ExitResponse = {
      eventId: presenceEvent.id,
      residentId: resident.id,
      eventType: 'EXIT',
      status: 'VERIFIED_OUTSIDE',
      serverTimestamp: serverTimestamp.toISOString(),
      curfewDate,
    };

    if (data.idempotencyKey) {
      await this.presenceRepo.saveIdempotentResponse({
        key: data.idempotencyKey,
        action: 'RECORD_EXIT',
        responseBody: response,
        statusCode: 200,
        createdAt: new Date(),
      });
    }

    return response;
  }

  /**
   * Returns presence state and history for the authenticated resident.
   */
  async getResidentPresence(residentUserId: string) {
    const resident = await this.authRepo.findResidentByUserId(residentUserId);
    if (!resident) {
      throw new NotFoundError('Resident profile not found for this user account');
    }

    const latestEvent = await this.presenceRepo.findLatestPresenceEvent(resident.id);
    const recentEvents = await this.presenceRepo.findPresenceEventsByResidentId(resident.id, 10);
    const activeDevice = await this.authRepo.findActiveDeviceByResidentId(resident.id);

    return {
      residentId: resident.id,
      currentStatus: latestEvent?.status ?? 'NOT_VERIFIED',
      lastEventType: latestEvent?.eventType ?? null,
      lastEventTimestamp: latestEvent?.serverTimestamp.toISOString() ?? null,
      activeDevice: activeDevice
        ? {
            id: activeDevice.id,
            deviceModel: activeDevice.deviceModel,
            status: activeDevice.status,
          }
        : null,
      recentEvents: recentEvents.map((e) => ({
        id: e.id,
        eventType: e.eventType,
        status: e.status,
        serverTimestamp: e.serverTimestamp.toISOString(),
        curfewDate: e.curfewDate,
      })),
    };
  }

  /**
   * Returns hostel presence overview for wardens or specific resident status.
   */
  async getPresenceStatus(
    actor: AccessTokenPayload,
    query: { residentId?: string; hostelId?: string }
  ) {
    // If resident calls status, they can only view their own
    if (actor.role === 'RESIDENT') {
      if (!actor.residentId) {
        throw new ForbiddenError('No resident profile bound to token');
      }
      if (query.residentId && query.residentId !== actor.residentId) {
        throw new ForbiddenError('Residents cannot query status of other residents');
      }
      return this.getResidentPresence(actor.userId);
    }

    // Warden / Admin queries
    const allEvents = await this.presenceRepo.getAllPresenceEvents();

    if (query.residentId) {
      const residentEvents = allEvents
        .filter((e) => e.residentId === query.residentId)
        .sort((a, b) => b.serverTimestamp.getTime() - a.serverTimestamp.getTime());
      const latest = residentEvents[0];
      return {
        residentId: query.residentId,
        currentStatus: latest?.status ?? 'NOT_VERIFIED',
        lastEvent: latest,
      };
    }

    // Summary counts
    const residentStatusMap = new Map<string, PresenceEvent>();
    for (const event of allEvents) {
      const existing = residentStatusMap.get(event.residentId);
      if (!existing || event.serverTimestamp > existing.serverTimestamp) {
        residentStatusMap.set(event.residentId, event);
      }
    }

    let verifiedInsideCount = 0;
    let verifiedOutsideCount = 0;
    const roster: { residentId: string; status: string; lastSeen: string }[] = [];

    for (const [resId, ev] of residentStatusMap.entries()) {
      if (ev.status === 'VERIFIED_INSIDE') {
        verifiedInsideCount++;
      } else {
        verifiedOutsideCount++;
      }
      roster.push({
        residentId: resId,
        status: ev.status,
        lastSeen: ev.serverTimestamp.toISOString(),
      });
    }

    return {
      summary: {
        totalTracked: residentStatusMap.size,
        verifiedInside: verifiedInsideCount,
        verifiedOutside: verifiedOutsideCount,
      },
      roster,
    };
  }
}
