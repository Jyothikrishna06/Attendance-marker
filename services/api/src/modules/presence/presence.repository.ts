import crypto from 'crypto';
import {
  VerificationAttempt,
  PresenceEvent,
  IdempotencyRecord,
} from '../../common/types.js';

export interface IPresenceRepository {
  createVerificationAttempt(data: {
    residentId: string;
    deviceId: string;
    sessionNonceHash: string;
    challengeIssuedAt: Date;
    challengeExpiresAt: Date;
    clientMetadata?: Record<string, unknown>;
  }): Promise<VerificationAttempt>;

  findVerificationAttemptById(id: string): Promise<VerificationAttempt | null>;
  findVerificationAttemptByNonceHash(hash: string): Promise<VerificationAttempt | null>;
  updateVerificationAttempt(id: string, updates: Partial<VerificationAttempt>): Promise<VerificationAttempt>;

  createPresenceEvent(data: {
    residentId: string;
    eventType: 'ENTRY' | 'EXIT';
    source: 'VERIFICATION_SESSION' | 'WARDEN_MANUAL' | 'ADMIN_OVERRIDE';
    verificationAttemptId?: string | null;
    eventTimestamp?: Date;
    serverTimestamp: Date;
    curfewDate: string;
    status: 'VERIFIED_INSIDE' | 'VERIFIED_OUTSIDE' | 'FLAGGED';
    networkEvidence?: Record<string, unknown>;
  }): Promise<PresenceEvent>;

  findLatestPresenceEvent(residentId: string): Promise<PresenceEvent | null>;
  findPresenceEventsByResidentId(residentId: string, limit?: number): Promise<PresenceEvent[]>;
  getAllPresenceEvents(): Promise<PresenceEvent[]>;

  getIdempotentResponse(key: string): Promise<IdempotencyRecord | null>;
  saveIdempotentResponse(record: IdempotencyRecord): Promise<void>;
}

export class InMemoryPresenceRepository implements IPresenceRepository {
  private verificationAttempts: Map<string, VerificationAttempt> = new Map();
  private presenceEvents: PresenceEvent[] = [];
  private idempotencyStore: Map<string, IdempotencyRecord> = new Map();

  async createVerificationAttempt(data: {
    residentId: string;
    deviceId: string;
    sessionNonceHash: string;
    challengeIssuedAt: Date;
    challengeExpiresAt: Date;
    clientMetadata?: Record<string, unknown>;
  }): Promise<VerificationAttempt> {
    const attempt: VerificationAttempt = {
      id: crypto.randomUUID(),
      residentId: data.residentId,
      deviceId: data.deviceId,
      sessionNonceHash: data.sessionNonceHash,
      challengeIssuedAt: data.challengeIssuedAt,
      challengeExpiresAt: data.challengeExpiresAt,
      biometricVerified: false,
      networkVerified: false,
      status: 'PENDING',
      failureReason: null,
      consumedAt: null,
      clientMetadata: data.clientMetadata || {},
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.verificationAttempts.set(attempt.id, attempt);
    return attempt;
  }

  async findVerificationAttemptById(id: string): Promise<VerificationAttempt | null> {
    return this.verificationAttempts.get(id) || null;
  }

  async findVerificationAttemptByNonceHash(hash: string): Promise<VerificationAttempt | null> {
    for (const attempt of this.verificationAttempts.values()) {
      if (attempt.sessionNonceHash === hash) {
        return attempt;
      }
    }
    return null;
  }

  async updateVerificationAttempt(
    id: string,
    updates: Partial<VerificationAttempt>
  ): Promise<VerificationAttempt> {
    const attempt = this.verificationAttempts.get(id);
    if (!attempt) {
      throw new Error(`Verification attempt ${id} not found`);
    }

    const updated: VerificationAttempt = {
      ...attempt,
      ...updates,
      updatedAt: new Date(),
    };

    this.verificationAttempts.set(id, updated);
    return updated;
  }

  async createPresenceEvent(data: {
    residentId: string;
    eventType: 'ENTRY' | 'EXIT';
    source: 'VERIFICATION_SESSION' | 'WARDEN_MANUAL' | 'ADMIN_OVERRIDE';
    verificationAttemptId?: string | null;
    eventTimestamp?: Date;
    serverTimestamp: Date;
    curfewDate: string;
    status: 'VERIFIED_INSIDE' | 'VERIFIED_OUTSIDE' | 'FLAGGED';
    networkEvidence?: Record<string, unknown>;
  }): Promise<PresenceEvent> {
    const event: PresenceEvent = {
      id: crypto.randomUUID(),
      residentId: data.residentId,
      eventType: data.eventType,
      source: data.source,
      verificationAttemptId: data.verificationAttemptId || null,
      eventTimestamp: data.eventTimestamp || data.serverTimestamp,
      serverTimestamp: data.serverTimestamp,
      curfewDate: data.curfewDate,
      status: data.status,
      networkEvidence: data.networkEvidence || {},
      createdAt: new Date(),
    };

    this.presenceEvents.push(event);
    return event;
  }

  async findLatestPresenceEvent(residentId: string): Promise<PresenceEvent | null> {
    const events = this.presenceEvents
      .filter((e) => e.residentId === residentId)
      .sort((a, b) => b.serverTimestamp.getTime() - a.serverTimestamp.getTime());

    return events.length > 0 ? events[0] : null;
  }

  async findPresenceEventsByResidentId(residentId: string, limit = 20): Promise<PresenceEvent[]> {
    return this.presenceEvents
      .filter((e) => e.residentId === residentId)
      .sort((a, b) => b.serverTimestamp.getTime() - a.serverTimestamp.getTime())
      .slice(0, limit);
  }

  async getAllPresenceEvents(): Promise<PresenceEvent[]> {
    return [...this.presenceEvents];
  }

  async getIdempotentResponse(key: string): Promise<IdempotencyRecord | null> {
    return this.idempotencyStore.get(key) || null;
  }

  async saveIdempotentResponse(record: IdempotencyRecord): Promise<void> {
    this.idempotencyStore.set(record.key, record);
  }
}
