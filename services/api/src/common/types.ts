export type UserRole = 'RESIDENT' | 'WARDEN' | 'ADMIN' | 'SUPER_ADMIN';

export type UserStatus = 'PENDING_ACTIVATION' | 'ACTIVE' | 'SUSPENDED' | 'DEACTIVATED';

export type DeviceStatus = 'PENDING_APPROVAL' | 'ACTIVE' | 'REVOKED';

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
