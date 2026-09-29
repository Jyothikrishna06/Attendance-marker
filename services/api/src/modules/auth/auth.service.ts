import crypto from 'crypto';
import { IAuthRepository } from './auth.repository.js';
import { hashPassword, verifyPassword, hashToken, generateRandomToken } from '../../core/crypto.js';
import { signAccessToken, signRefreshToken, verifyRefreshToken } from '../../core/jwt.js';
import { UnauthorizedError, ForbiddenError, NotFoundError } from '../../common/errors.js';
import { AuthResponse, Device } from '../../common/types.js';
import { env } from '../../config/env.js';
import { IAuditService } from '../audit/audit.service.js';

export class AuthService {
  constructor(
    private readonly authRepo: IAuthRepository,
    private readonly auditService?: IAuditService
  ) {}

  /**
   * Authenticates a user using email & password credentials.
   */
  async login(email: string, passwordPlain: string): Promise<AuthResponse> {
    const user = await this.authRepo.findUserByEmail(email);
    if (!user) {
      // Constant-time dummy hash verification to prevent user enumeration timing attacks
      await verifyPassword('dummy_pass', '$2a$12$K1d0F11m1j4aXkE3sI6/6u5k2n1eQ4A8M3cW6rP9yL0zD5xV2j1K6');
      throw new UnauthorizedError('Invalid email or password credentials', 'INVALID_CREDENTIALS');
    }

    if (user.status === 'PENDING_ACTIVATION') {
      throw new UnauthorizedError(
        'Account is pending activation. Please use the activation endpoint with your assigned token.',
        'ACCOUNT_PENDING_ACTIVATION'
      );
    }

    if (user.status !== 'ACTIVE') {
      throw new ForbiddenError(
        `Account access denied. Account status is: ${user.status}`,
        'ACCOUNT_NOT_ACTIVE'
      );
    }

    const isMatch = await verifyPassword(passwordPlain, user.passwordHash);
    if (!isMatch) {
      throw new UnauthorizedError('Invalid email or password credentials', 'INVALID_CREDENTIALS');
    }

    // Load Resident profile & Active device if user is a resident
    let residentProfile = null;
    let activeDevice: Device | null = null;
    if (user.role === 'RESIDENT') {
      residentProfile = await this.authRepo.findResidentByUserId(user.id);
      if (residentProfile) {
        activeDevice = await this.authRepo.findActiveDeviceByResidentId(residentProfile.id);
      }
    }

    // Issue tokens
    const accessToken = signAccessToken({
      userId: user.id,
      email: user.email,
      role: user.role,
      status: user.status,
      residentId: residentProfile?.id,
    });

    const tokenId = crypto.randomUUID();
    const refreshTokenPlain = signRefreshToken({
      userId: user.id,
      tokenId,
    });

    // Save refresh token record
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    await this.authRepo.saveRefreshToken({
      id: tokenId,
      userId: user.id,
      tokenHash: hashToken(refreshTokenPlain),
      expiresAt,
      revoked: false,
      createdAt: new Date(),
    });

    return {
      accessToken,
      refreshToken: refreshTokenPlain,
      expiresIn: env.JWT_ACCESS_EXPIRES_IN,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        status: user.status,
        residentProfile,
        activeDevice,
      },
    };
  }

  /**
   * Refreshes access token with token rotation and revocation verification.
   */
  async refresh(refreshTokenPlain: string): Promise<{ accessToken: string; refreshToken: string; expiresIn: string }> {
    const payload = verifyRefreshToken(refreshTokenPlain);

    const tokenRecord = await this.authRepo.findRefreshToken(payload.tokenId);
    if (!tokenRecord || tokenRecord.revoked || new Date() > tokenRecord.expiresAt) {
      throw new UnauthorizedError('Refresh token is invalid, revoked, or expired', 'REFRESH_TOKEN_INVALID');
    }

    // Verify token hash
    if (tokenRecord.tokenHash !== hashToken(refreshTokenPlain)) {
      // Possible token reuse attack detected! Revoke immediately.
      await this.authRepo.revokeRefreshToken(payload.tokenId);
      throw new UnauthorizedError('Token anomaly detected. Session terminated.', 'TOKEN_TAMPERED');
    }

    const user = await this.authRepo.findUserById(payload.userId);
    if (!user || user.status !== 'ACTIVE') {
      throw new UnauthorizedError('Associated user account is no longer active', 'USER_INACTIVE');
    }

    // Fetch resident profile if role is resident
    let residentProfile = null;
    if (user.role === 'RESIDENT') {
      residentProfile = await this.authRepo.findResidentByUserId(user.id);
    }

    // Rotate token: revoke old token, issue new token pair
    await this.authRepo.revokeRefreshToken(payload.tokenId);

    const newAccessToken = signAccessToken({
      userId: user.id,
      email: user.email,
      role: user.role,
      status: user.status,
      residentId: residentProfile?.id,
    });

    const newTokenId = crypto.randomUUID();
    const newRefreshToken = signRefreshToken({
      userId: user.id,
      tokenId: newTokenId,
    });

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    await this.authRepo.saveRefreshToken({
      id: newTokenId,
      userId: user.id,
      tokenHash: hashToken(newRefreshToken),
      expiresAt,
      revoked: false,
      createdAt: new Date(),
    });

    return {
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
      expiresIn: env.JWT_ACCESS_EXPIRES_IN,
    };
  }

  /**
   * Logs out the user by explicitly revoking the refresh token.
   */
  async logout(refreshTokenPlain?: string): Promise<{ message: string }> {
    if (refreshTokenPlain) {
      try {
        const payload = verifyRefreshToken(refreshTokenPlain);
        await this.authRepo.revokeRefreshToken(payload.tokenId);
      } catch {
        // Silently proceed on logout even if token expired
      }
    }
    return { message: 'Logged out successfully' };
  }

  /**
   * Activates a resident account that was pre-provisioned by administration.
   */
  async activate(
    email: string,
    activationToken: string,
    newPasswordPlain: string,
    ipAddress?: string
  ): Promise<{ message: string }> {
    const user = await this.authRepo.findUserByEmail(email);
    if (!user) {
      throw new NotFoundError('No account found matching the provided email address');
    }

    if (user.status !== 'PENDING_ACTIVATION') {
      throw new ForbiddenError('Account is already activated or in an invalid state for activation');
    }

    if (!user.activationToken || user.activationToken !== activationToken) {
      throw new UnauthorizedError('Invalid activation token provided', 'INVALID_ACTIVATION_TOKEN');
    }

    const hashedPassword = await hashPassword(newPasswordPlain);
    await this.authRepo.updateUserPasswordAndStatus(user.id, hashedPassword, 'ACTIVE');

    if (this.auditService) {
      await this.auditService.recordAuditEvent({
        actorId: user.id,
        actorRole: user.role,
        action: 'ACCOUNT_ACTIVATED',
        targetEntity: 'users',
        targetId: user.id,
        previousState: { status: 'PENDING_ACTIVATION' },
        newState: { status: 'ACTIVE' },
        reason: 'Resident completed self-service mobile activation with valid activation token',
        ipAddress: ipAddress || null,
      });
    }

    return { message: 'Account successfully activated. You may now log in with your credentials.' };
  }

  /**
   * Registers/binds a hardware device to an authenticated resident.
   */
  async registerDevice(
    userId: string,
    data: {
      deviceIdentifier: string;
      deviceModel: string;
      osName: 'ANDROID' | 'IOS' | 'TEST_OS';
      osVersion: string;
    },
    ipAddress?: string
  ): Promise<Device> {
    const user = await this.authRepo.findUserById(userId);
    if (!user || user.role !== 'RESIDENT') {
      throw new ForbiddenError('Only resident accounts are permitted to register mobile devices');
    }

    const resident = await this.authRepo.findResidentByUserId(userId);
    if (!resident) {
      throw new NotFoundError('Resident profile not found for this account');
    }

    const device = await this.authRepo.registerDevice({
      residentId: resident.id,
      deviceIdentifier: data.deviceIdentifier,
      deviceModel: data.deviceModel,
      osName: data.osName,
      osVersion: data.osVersion,
    });

    if (this.auditService) {
      await this.auditService.recordAuditEvent({
        actorId: userId,
        actorRole: 'RESIDENT',
        action: 'DEVICE_REGISTERED',
        targetEntity: 'devices',
        targetId: device.id,
        previousState: null,
        newState: {
          deviceIdentifier: device.deviceIdentifier,
          deviceModel: device.deviceModel,
          osName: device.osName,
          osVersion: device.osVersion,
          status: device.status,
        },
        reason: 'Resident bound new mobile device to account',
        ipAddress: ipAddress || null,
      });
    }

    return device;
  }
}
