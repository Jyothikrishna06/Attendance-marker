export type UserRole = 'RESIDENT' | 'WARDEN' | 'ADMIN' | 'SUPER_ADMIN';

export type UserStatus = 'PENDING_ACTIVATION' | 'ACTIVE' | 'SUSPENDED' | 'DEACTIVATED';

export type DeviceStatus = 'PENDING_APPROVAL' | 'ACTIVE' | 'REVOKED';

export type PresenceEventType = 'ENTRY' | 'EXIT';

export type PresenceEventStatus = 'VERIFIED_INSIDE' | 'VERIFIED_OUTSIDE' | 'FLAGGED';

export type PresenceSource = 'VERIFICATION_SESSION' | 'WARDEN_MANUAL' | 'ADMIN_OVERRIDE';

export type VerificationStatus = 'PENDING' | 'VERIFIED' | 'EXPIRED' | 'FAILED' | 'REJECTED';

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  passwordHash: string;
  status: UserStatus;
  activationToken?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ResidentProfile {
  id: string;
  userId: string;
  rollNumber: string;
  hostelId: string;
  roomId: string;
  emergencyContactName: string;
  emergencyContactPhone: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface Device {
  id: string;
  residentId: string;
  deviceIdentifier: string;
  deviceModel: string;
  osName: 'ANDROID' | 'IOS' | 'TEST_OS';
  osVersion: string;
  status: DeviceStatus;
  registeredAt: Date;
  approvedBy?: string | null;
  revokedAt?: Date | null;
  revocationReason?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface RefreshTokenRecord {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  revoked: boolean;
  createdAt: Date;
}

export interface AccessTokenPayload {
  userId: string;
  email: string;
  role: UserRole;
  status: UserStatus;
  residentId?: string;
}

export interface RefreshTokenPayload {
  userId: string;
  tokenId: string;
}

export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  expiresIn: string;
  user: {
    id: string;
    name: string;
    email: string;
    role: UserRole;
    status: UserStatus;
    residentProfile?: ResidentProfile | null;
    activeDevice?: Device | null;
  };
}

export interface VerificationAttempt {
  id: string;
  residentId: string;
  deviceId: string;
  sessionNonceHash: string;
  challengeIssuedAt: Date;
  challengeExpiresAt: Date;
  biometricVerified: boolean;
  networkVerified: boolean;
  status: VerificationStatus;
  failureReason?: string | null;
  consumedAt?: Date | null;
  clientMetadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface PresenceEvent {
  id: string;
  residentId: string;
  eventType: PresenceEventType;
  source: PresenceSource;
  verificationAttemptId?: string | null;
  eventTimestamp: Date;
  serverTimestamp: Date;
  curfewDate: string; // YYYY-MM-DD
  status: PresenceEventStatus;
  networkEvidence: Record<string, unknown>;
  createdAt: Date;
}

export interface IdempotencyRecord {
  key: string;
  action: string;
  responseBody: unknown;
  statusCode: number;
  createdAt: Date;
}
