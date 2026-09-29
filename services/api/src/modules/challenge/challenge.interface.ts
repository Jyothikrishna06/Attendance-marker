export interface GenerateChallengeOptions {
  deviceId?: string;
  ttlSeconds?: number;
  clientMetadata?: Record<string, unknown>;
}

export interface GenerateChallengeResponse {
  challengeId: string;
  sessionId: string;
  challengeNonce: string;
  issuedAt: string;
  expiresAt: string;
  ttlSeconds: number;
  deviceId: string;
  residentId: string;
}

export interface VerifyChallengeInput {
  challengeId: string;
  challengeNonce: string;
  biometricConfirmed?: boolean;
  networkMetadata?: Record<string, unknown>;
  idempotencyKey?: string;
}

export interface VerifyChallengeResponse {
  challengeId: string;
  residentId: string;
  status: 'VERIFIED';
  verifiedAt: string;
  biometricVerified: boolean;
  message: string;
}
