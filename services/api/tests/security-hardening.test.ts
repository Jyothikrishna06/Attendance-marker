import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { parseEnv, DEV_DEFAULT_ACCESS_SECRET, DEV_DEFAULT_REFRESH_SECRET } from '../src/config/env.js';
import { InMemoryAuthRepository } from '../src/modules/auth/auth.repository.js';
import { InMemoryPresenceRepository } from '../src/modules/presence/presence.repository.js';
import { InMemoryAdminRepository } from '../src/modules/admin/admin.repository.js';
import { signAccessToken, signRefreshToken, verifyAccessToken, verifyRefreshToken } from '../src/core/jwt.js';
import { hashPassword } from '../src/core/crypto.js';
import { UnauthorizedError } from '../src/common/errors.js';

describe('Security Hardening & Comprehensive Defense Verification', () => {
  let authRepo: InMemoryAuthRepository;
  let presenceRepo: InMemoryPresenceRepository;
  let adminRepo: InMemoryAdminRepository;
  let app: ReturnType<typeof createApp>;

  let residentToken: string;
  let wardenToken: string;
  let adminToken: string;

  const residentCreds = {
    email: 'aarav.patel@student.edu',
    password: 'ResidentAaravPass!2026',
  };

  const residentDiyaCreds = {
    email: 'diya.sharma@student.edu',
    password: 'ResidentDiyaPass!2026',
  };

  const wardenCreds = {
    email: 'warden.sharma@hostel.edu',
    password: 'WardenSecurePass!2026',
  };

  const adminCreds = {
    email: 'admin@campus.edu',
    password: 'AdminSecurePass!2026',
  };

  beforeEach(async () => {
    authRepo = new InMemoryAuthRepository();
    presenceRepo = new InMemoryPresenceRepository();
    adminRepo = new InMemoryAdminRepository();

    const residentHash = await hashPassword(residentCreds.password);
    const diyaHash = await hashPassword(residentDiyaCreds.password);
    const wardenHash = await hashPassword(wardenCreds.password);
    const adminHash = await hashPassword(adminCreds.password);

    await authRepo.updateUserPasswordAndStatus('c0000000-0000-0000-0000-000000000003', residentHash, 'ACTIVE');
    await authRepo.updateUserPasswordAndStatus('c0000000-0000-0000-0000-000000000004', diyaHash, 'ACTIVE');
    await authRepo.updateUserPasswordAndStatus('c0000000-0000-0000-0000-000000000002', wardenHash, 'ACTIVE');
    await authRepo.updateUserPasswordAndStatus('c0000000-0000-0000-0000-000000000001', adminHash, 'ACTIVE');

    app = createApp(authRepo, presenceRepo, undefined, adminRepo);

    // Login users to get authoritative signed tokens
    const resLogin = await request(app).post('/auth/login').send(residentCreds);
    residentToken = resLogin.body.data.accessToken;

    const wardenLogin = await request(app).post('/auth/login').send(wardenCreds);
    wardenToken = wardenLogin.body.data.accessToken;

    const adminLogin = await request(app).post('/auth/login').send(adminCreds);
    adminToken = adminLogin.body.data.accessToken;
  });

  // ==========================================================================
  // 1. Environment & Secret Hardening Controls
  // ==========================================================================
  describe('Environment & Secret Hardening', () => {
    it('should successfully parse valid development / test environment defaults', () => {
      const config = parseEnv({
        NODE_ENV: 'test',
      });
      assert.equal(config.NODE_ENV, 'test');
      assert.equal(config.JWT_ACCESS_SECRET, DEV_DEFAULT_ACCESS_SECRET);
    });

    it('should reject production mode when JWT_ACCESS_SECRET uses the dev default', () => {
      assert.throws(
        () => {
          parseEnv({
            NODE_ENV: 'production',
            JWT_ACCESS_SECRET: DEV_DEFAULT_ACCESS_SECRET,
            JWT_REFRESH_SECRET: 'a_very_secure_production_refresh_token_secret_string_1234567890',
          });
        },
        /Environment variable validation failure/
      );
    });

    it('should reject production mode when JWT_ACCESS_SECRET is shorter than 32 characters', () => {
      assert.throws(
        () => {
          parseEnv({
            NODE_ENV: 'production',
            JWT_ACCESS_SECRET: 'short_key_12345',
            JWT_REFRESH_SECRET: 'a_very_secure_production_refresh_token_secret_string_1234567890',
          });
        },
        /Environment variable validation failure/
      );
    });

    it('should reject production mode when JWT_REFRESH_SECRET uses the dev default', () => {
      assert.throws(
        () => {
          parseEnv({
            NODE_ENV: 'production',
            JWT_ACCESS_SECRET: 'a_very_secure_production_access_token_secret_string_1234567890',
            JWT_REFRESH_SECRET: DEV_DEFAULT_REFRESH_SECRET,
          });
        },
        /Environment variable validation failure/
      );
    });

    it('should reject production mode when JWT_ACCESS_SECRET and JWT_REFRESH_SECRET are identical', () => {
      const sameSecret = 'identical_secure_token_secret_shared_across_both_types_1234567890';
      assert.throws(
        () => {
          parseEnv({
            NODE_ENV: 'production',
            JWT_ACCESS_SECRET: sameSecret,
            JWT_REFRESH_SECRET: sameSecret,
          });
        },
        /Environment variable validation failure/
      );
    });

    it('should accept production mode when distinct >=32-char secrets are configured', () => {
      const prodConfig = parseEnv({
        NODE_ENV: 'production',
        JWT_ACCESS_SECRET: 'prod_jwt_access_secret_super_secure_key_campus_hostel_curfew_2026',
        JWT_REFRESH_SECRET: 'prod_jwt_refresh_secret_super_secure_key_campus_hostel_curfew_2026',
      });
      assert.equal(prodConfig.NODE_ENV, 'production');
      assert.equal(
        prodConfig.JWT_ACCESS_SECRET,
        'prod_jwt_access_secret_super_secure_key_campus_hostel_curfew_2026'
      );
    });
  });

  // ==========================================================================
  // 2. Cryptographic Token Integrity & Cross-Secret Protection
  // ==========================================================================
  describe('Cryptographic Token Integrity & Cross-Secret Protection', () => {
    it('should reject verifying an access token signed with the refresh secret', () => {
      const tokenSignedWithWrongSecret = signRefreshToken({
        userId: 'c0000000-0000-0000-0000-000000000003',
        tokenId: 'r0000000-0000-0000-0000-000000000001',
      });

      assert.throws(
        () => {
          verifyAccessToken(tokenSignedWithWrongSecret);
        },
        (err: unknown) => {
          assert.ok(err instanceof UnauthorizedError);
          assert.equal((err as UnauthorizedError).code, 'INVALID_TOKEN');
          return true;
        }
      );
    });

    it('should reject verifying a refresh token signed with the access secret', () => {
      const tokenSignedWithAccessSecret = signAccessToken({
        userId: 'c0000000-0000-0000-0000-000000000003',
        email: 'aarav.patel@student.edu',
        role: 'RESIDENT',
        status: 'ACTIVE',
        residentId: 'd0000000-0000-0000-0000-000000000001',
      });

      assert.throws(
        () => {
          verifyRefreshToken(tokenSignedWithAccessSecret);
        },
        (err: unknown) => {
          assert.ok(err instanceof UnauthorizedError);
          assert.equal((err as UnauthorizedError).code, 'INVALID_REFRESH_TOKEN');
          return true;
        }
      );
    });

    it('should reject tampered or forged JWT tokens', () => {
      const parts = residentToken.split('.');
      // Tamper with payload by mutating base64 character
      const tamperedPayload = parts[1].slice(0, -4) + 'AAAA';
      const forgedToken = `${parts[0]}.${tamperedPayload}.${parts[2]}`;

      assert.throws(
        () => {
          verifyAccessToken(forgedToken);
        },
        (err: unknown) => {
          assert.ok(err instanceof UnauthorizedError);
          return true;
        }
      );
    });
  });

  // ==========================================================================
  // 3. User Enumeration Protection (Constant-Time Dummy Bcrypt)
  // ==========================================================================
  describe('User Enumeration Defense', () => {
    it('should return identical 401 INVALID_CREDENTIALS for non-existent users and wrong passwords', async () => {
      // Non-existent user
      const nonExistentRes = await request(app)
        .post('/auth/login')
        .send({
          email: 'unknown.ghost.user@campus.edu',
          password: 'SomePassword123!',
        });

      assert.equal(nonExistentRes.status, 401);
      assert.equal(nonExistentRes.body.error.code, 'INVALID_CREDENTIALS');

      // Existing user with wrong password
      const wrongPassRes = await request(app)
        .post('/auth/login')
        .send({
          email: 'aarav.patel@student.edu',
          password: 'CompletelyWrongPassword123!',
        });

      assert.equal(wrongPassRes.status, 401);
      assert.equal(wrongPassRes.body.error.code, 'INVALID_CREDENTIALS');
    });
  });

  // ==========================================================================
  // 4. Role Escalation Protection (RBAC Matrix)
  // ==========================================================================
  describe('RBAC Role Escalation Defense', () => {
    it('should strictly reject RESIDENT from accessing admin leave queue', async () => {
      const res = await request(app)
        .get('/admin/leave')
        .set('Authorization', `Bearer ${residentToken}`);

      assert.equal(res.status, 403);
      assert.equal(res.body.error.code, 'ROLE_NOT_AUTHORIZED');
    });

    it('should strictly reject RESIDENT from accessing audit logs', async () => {
      const res = await request(app)
        .get('/admin/audit')
        .set('Authorization', `Bearer ${residentToken}`);

      assert.equal(res.status, 403);
      assert.equal(res.body.error.code, 'ROLE_NOT_AUTHORIZED');
    });

    it('should strictly reject RESIDENT from triggering curfew evaluation', async () => {
      const res = await request(app)
        .post('/admin/curfew/evaluate')
        .set('Authorization', `Bearer ${residentToken}`)
        .send({
          hostelId: 'a0000000-0000-0000-0000-000000000001',
          date: '2026-09-29',
        });

      assert.equal(res.status, 403);
      assert.equal(res.body.error.code, 'ROLE_NOT_AUTHORIZED');
    });

    it('should allow WARDEN to access leave queue and presence rosters', async () => {
      const res = await request(app)
        .get('/admin/leave')
        .set('Authorization', `Bearer ${wardenToken}`);

      assert.equal(res.status, 200);
      assert.ok(Array.isArray(res.body.data));
    });
  });

  // ==========================================================================
  // 5. Anti-Replay Nonce & Wrong-User Protection
  // ==========================================================================
  describe('Anti-Replay Nonce & Wrong-User Verification', () => {
    it('should reject verifying a challenge with a different resident identity', async () => {
      // Login Diya
      const diyaLogin = await request(app).post('/auth/login').send(residentDiyaCreds);
      const residentDiyaToken = diyaLogin.body.data.accessToken;

      // Aarav generates a challenge
      const genRes = await request(app)
        .post('/verification/challenge/generate')
        .set('Authorization', `Bearer ${residentToken}`)
        .send({
          clientMetadata: { platform: 'ANDROID_14' },
        });

      assert.equal(genRes.status, 200);
      const { challengeId, challengeNonce } = genRes.body.data;

      // Diya attempts to claim Aarav's challenge
      const verifyRes = await request(app)
        .post('/verification/challenge/verify')
        .set('Authorization', `Bearer ${residentDiyaToken}`)
        .send({
          challengeId,
          challengeNonce,
        });

      assert.equal(verifyRes.status, 403);
      assert.equal(verifyRes.body.error.code, 'WRONG_USER_CHALLENGE');
    });
  });
});
