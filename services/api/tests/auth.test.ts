import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { InMemoryAuthRepository } from '../src/modules/auth/auth.repository.js';
import { hashPassword, verifyPassword } from '../src/core/crypto.js';
import { signAccessToken } from '../src/core/jwt.js';

describe('Authentication & RBAC Security Test Suite', () => {
  let authRepo: InMemoryAuthRepository;
  let app: ReturnType<typeof createApp>;

  beforeEach(async () => {
    authRepo = new InMemoryAuthRepository();
    // Hash passwords dynamically for seeded accounts to test real bcrypt
    const testHash = await hashPassword('SecureStudentPass!2026');
    const adminHash = await hashPassword('AdminSecurePass!2026');
    const wardenHash = await hashPassword('WardenSecurePass!2026');

    await authRepo.updateUserPasswordAndStatus(
      'c0000000-0000-0000-0000-000000000003',
      testHash,
      'ACTIVE'
    );
    await authRepo.updateUserPasswordAndStatus(
      'c0000000-0000-0000-0000-000000000001',
      adminHash,
      'ACTIVE'
    );
    await authRepo.updateUserPasswordAndStatus(
      'c0000000-0000-0000-0000-000000000002',
      wardenHash,
      'ACTIVE'
    );

    app = createApp(authRepo);
  });

  // ----------------------------------------------------------------------------
  // 1. Password Hashing & Cryptographic Verification
  // ----------------------------------------------------------------------------
  describe('Password Hashing & Crypto', () => {
    it('should generate a bcrypt salted hash and successfully verify against plaintext', async () => {
      const plaintext = 'SuperSecretPa$$w0rd2026';
      const hash = await hashPassword(plaintext);

      assert.notEqual(hash, plaintext);
      assert.ok(hash.startsWith('$2a$') || hash.startsWith('$2b$'));

      const isMatch = await verifyPassword(plaintext, hash);
      assert.equal(isMatch, true);

      const isWrong = await verifyPassword('IncorrectPassword123!', hash);
      assert.equal(isWrong, false);
    });
  });

  // ----------------------------------------------------------------------------
  // 2. Authentication Endpoints: POST /auth/login
  // ----------------------------------------------------------------------------
  describe('POST /auth/login', () => {
    it('should log in an active resident and return JWT tokens and device metadata', async () => {
      const res = await request(app)
        .post('/auth/login')
        .send({
          email: 'aarav.patel@student.edu',
          password: 'SecureStudentPass!2026',
        });

      assert.equal(res.status, 200);
      assert.ok(res.body.data.accessToken, 'Access token must be returned');
      assert.ok(res.body.data.refreshToken, 'Refresh token must be returned');
      assert.equal(res.body.data.user.role, 'RESIDENT');
      assert.equal(res.body.data.user.status, 'ACTIVE');
      assert.equal(res.body.data.user.residentProfile.rollNumber, 'CS2026-001');
      assert.equal(res.body.data.user.activeDevice.deviceIdentifier, 'DEV-FINGERPRINT-AARAV-PIXEL8');
    });

    it('should reject invalid password with 401 INVALID_CREDENTIALS', async () => {
      const res = await request(app)
        .post('/auth/login')
        .send({
          email: 'aarav.patel@student.edu',
          password: 'WrongPassword999!',
        });

      assert.equal(res.status, 401);
      assert.equal(res.body.error.code, 'INVALID_CREDENTIALS');
    });

    it('should reject non-existent user with 401 to prevent user enumeration', async () => {
      const res = await request(app)
        .post('/auth/login')
        .send({
          email: 'unknown.ghost@campus.edu',
          password: 'AnyPassword123!',
        });

      assert.equal(res.status, 401);
      assert.equal(res.body.error.code, 'INVALID_CREDENTIALS');
    });

    it('should reject unactivated account with 401 ACCOUNT_PENDING_ACTIVATION', async () => {
      const res = await request(app)
        .post('/auth/login')
        .send({
          email: 'rohan.verma@student.edu',
          password: 'SomeTemporaryPassword1!',
        });

      assert.equal(res.status, 401);
      assert.equal(res.body.error.code, 'ACCOUNT_PENDING_ACTIVATION');
    });

    it('should fail schema validation for malformed email or short password with 400', async () => {
      const res = await request(app)
        .post('/auth/login')
        .send({
          email: 'not-an-email',
          password: 'short',
        });

      assert.equal(res.status, 400);
      assert.equal(res.body.error.code, 'VALIDATION_ERROR');
    });
  });

  // ----------------------------------------------------------------------------
  // 3. Token Refresh & Rotation: POST /auth/refresh
  // ----------------------------------------------------------------------------
  describe('POST /auth/refresh', () => {
    it('should rotate refresh token and issue a new access token', async () => {
      // 1. Initial login
      const loginRes = await request(app)
        .post('/auth/login')
        .send({
          email: 'aarav.patel@student.edu',
          password: 'SecureStudentPass!2026',
        });

      const initialRefreshToken = loginRes.body.data.refreshToken;

      // 2. Request token refresh
      const refreshRes = await request(app)
        .post('/auth/refresh')
        .send({ refreshToken: initialRefreshToken });

      assert.equal(refreshRes.status, 200);
      assert.ok(refreshRes.body.data.accessToken);
      assert.ok(refreshRes.body.data.refreshToken);
      assert.notEqual(refreshRes.body.data.refreshToken, initialRefreshToken, 'Refresh token must rotate');

      // 3. Re-using the old refresh token must fail (Replay protection)
      const reuseRes = await request(app)
        .post('/auth/refresh')
        .send({ refreshToken: initialRefreshToken });

      assert.equal(reuseRes.status, 401);
    });
  });

  // ----------------------------------------------------------------------------
  // 4. Resident Account Activation: POST /auth/activate
  // ----------------------------------------------------------------------------
  describe('POST /auth/activate', () => {
    it('should successfully activate a pending account and allow login with new password', async () => {
      // 1. Activate Rohan's account
      const activateRes = await request(app)
        .post('/auth/activate')
        .send({
          email: 'rohan.verma@student.edu',
          activationToken: 'ACTIVATE_ROHAN_2026_TOKEN',
          newPassword: 'RohanNewStrongPassword!2026',
        });

      assert.equal(activateRes.status, 200);

      // 2. Log in with new password
      const loginRes = await request(app)
        .post('/auth/login')
        .send({
          email: 'rohan.verma@student.edu',
          password: 'RohanNewStrongPassword!2026',
        });

      assert.equal(loginRes.status, 200);
      assert.equal(loginRes.body.data.user.status, 'ACTIVE');
    });

    it('should reject activation with incorrect activation token', async () => {
      const res = await request(app)
        .post('/auth/activate')
        .send({
          email: 'rohan.verma@student.edu',
          activationToken: 'WRONG_INVALID_TOKEN',
          newPassword: 'NewPassword123!',
        });

      assert.equal(res.status, 401);
      assert.equal(res.body.error.code, 'INVALID_ACTIVATION_TOKEN');
    });
  });

  // ----------------------------------------------------------------------------
  // 5. Hardware Device Registration: POST /auth/device/register
  // ----------------------------------------------------------------------------
  describe('POST /auth/device/register', () => {
    it('should register a new device for resident without an active device', async () => {
      // First activate Rohan so he is an active resident with 0 devices
      await request(app)
        .post('/auth/activate')
        .send({
          email: 'rohan.verma@student.edu',
          activationToken: 'ACTIVATE_ROHAN_2026_TOKEN',
          newPassword: 'RohanNewStrongPassword!2026',
        });

      const loginRes = await request(app)
        .post('/auth/login')
        .send({
          email: 'rohan.verma@student.edu',
          password: 'RohanNewStrongPassword!2026',
        });

      const token = loginRes.body.data.accessToken;

      const deviceRes = await request(app)
        .post('/auth/device/register')
        .set('Authorization', `Bearer ${token}`)
        .send({
          deviceIdentifier: 'NEW-HARDWARE-FINGERPRINT-ROHAN-1234',
          deviceModel: 'OnePlus 11',
          osName: 'ANDROID',
          osVersion: '14.0',
        });

      assert.equal(deviceRes.status, 201);
      assert.equal(deviceRes.body.data.device.deviceIdentifier, 'NEW-HARDWARE-FINGERPRINT-ROHAN-1234');
      assert.equal(deviceRes.body.data.device.status, 'ACTIVE');
    });

    it('should reject device registration when resident already has an active device (single-device rule)', async () => {
      // Aarav already has an ACTIVE device
      const loginRes = await request(app)
        .post('/auth/login')
        .send({
          email: 'aarav.patel@student.edu',
          password: 'SecureStudentPass!2026',
        });

      const token = loginRes.body.data.accessToken;

      const deviceRes = await request(app)
        .post('/auth/device/register')
        .set('Authorization', `Bearer ${token}`)
        .send({
          deviceIdentifier: 'ATTEMPTED-SECOND-DEVICE-FINGERPRINT',
          deviceModel: 'Samsung Tablet',
          osName: 'ANDROID',
          osVersion: '13.0',
        });

      assert.equal(deviceRes.status, 409);
      assert.equal(deviceRes.body.error.code, 'CONFLICT');
    });
  });

  // ----------------------------------------------------------------------------
  // 6. RBAC & Role Escalation Protection (Crucial Negative Tests)
  // ----------------------------------------------------------------------------
  describe('RBAC & Role Escalation Defense', () => {
    let residentToken: string;
    let wardenToken: string;
    let adminToken: string;

    beforeEach(async () => {
      // Login Resident
      const resResident = await request(app)
        .post('/auth/login')
        .send({ email: 'aarav.patel@student.edu', password: 'SecureStudentPass!2026' });
      residentToken = resResident.body.data.accessToken;

      // Login Warden
      const resWarden = await request(app)
        .post('/auth/login')
        .send({ email: 'warden.sharma@hostel.edu', password: 'WardenSecurePass!2026' });
      wardenToken = resWarden.body.data.accessToken;

      // Login Admin
      const resAdmin = await request(app)
        .post('/auth/login')
        .send({ email: 'admin@campus.edu', password: 'AdminSecurePass!2026' });
      adminToken = resAdmin.body.data.accessToken;
    });

    it('NEGATIVE TEST: Resident MUST BE FORBIDDEN (403) from accessing admin endpoints', async () => {
      const res = await request(app)
        .get('/admin/dashboard')
        .set('Authorization', `Bearer ${residentToken}`);

      assert.equal(res.status, 403);
      assert.equal(res.body.error.code, 'ROLE_NOT_AUTHORIZED');
    });

    it('NEGATIVE TEST: Resident MUST BE FORBIDDEN (403) from accessing warden endpoints', async () => {
      const res = await request(app)
        .get('/warden/roster')
        .set('Authorization', `Bearer ${residentToken}`);

      assert.equal(res.status, 403);
      assert.equal(res.body.error.code, 'ROLE_NOT_AUTHORIZED');
    });

    it('NEGATIVE TEST: Warden MUST BE FORBIDDEN (403) from accessing admin endpoints', async () => {
      const res = await request(app)
        .get('/admin/dashboard')
        .set('Authorization', `Bearer ${wardenToken}`);

      assert.equal(res.status, 403);
      assert.equal(res.body.error.code, 'ROLE_NOT_AUTHORIZED');
    });

    it('POSITIVE TEST: Warden CAN access warden roster endpoint (200)', async () => {
      const res = await request(app)
        .get('/warden/roster')
        .set('Authorization', `Bearer ${wardenToken}`);

      assert.equal(res.status, 200);
      assert.equal(res.body.user.role, 'WARDEN');
    });

    it('POSITIVE TEST: Admin CAN access admin dashboard endpoint (200)', async () => {
      const res = await request(app)
        .get('/admin/dashboard')
        .set('Authorization', `Bearer ${adminToken}`);

      assert.equal(res.status, 200);
      assert.equal(res.body.user.role, 'SUPER_ADMIN');
    });

    it('POSITIVE TEST: Resident CAN access resident home endpoint (200)', async () => {
      const res = await request(app)
        .get('/resident/home')
        .set('Authorization', `Bearer ${residentToken}`);

      assert.equal(res.status, 200);
      assert.equal(res.body.user.role, 'RESIDENT');
    });

    it('NEGATIVE TEST: Missing Authorization header returns 401 UNAUTHORIZED', async () => {
      const res = await request(app).get('/admin/dashboard');

      assert.equal(res.status, 401);
      assert.equal(res.body.error.code, 'AUTH_HEADER_MISSING');
    });

    it('NEGATIVE TEST: Tampered / Malformed JWT signature returns 401 INVALID_TOKEN', async () => {
      const res = await request(app)
        .get('/admin/dashboard')
        .set('Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.tampered.fake');

      assert.equal(res.status, 401);
      assert.equal(res.body.error.code, 'INVALID_TOKEN');
    });

    it('NEGATIVE TEST: Inactive or suspended user token is rejected with 403 ACCOUNT_INACTIVE', async () => {
      const suspendedToken = signAccessToken({
        userId: 'c0000000-0000-0000-0000-000000000099',
        email: 'suspended@campus.edu',
        role: 'RESIDENT',
        status: 'SUSPENDED',
      });

      const res = await request(app)
        .get('/resident/home')
        .set('Authorization', `Bearer ${suspendedToken}`);

      assert.equal(res.status, 403);
      assert.equal(res.body.error.code, 'ACCOUNT_INACTIVE');
    });
  });

  // ----------------------------------------------------------------------------
  // 7. Rate Limiting Protection on Authentication Endpoints
  // ----------------------------------------------------------------------------
  describe('Brute-force Rate Limiting', () => {
    it('should trigger HTTP 429 Too Many Requests after exceeding max failed login attempts', async () => {
      // Max attempts configured in env is 5
      for (let i = 0; i < 5; i++) {
        await request(app)
          .post('/auth/login')
          .send({
            email: 'aarav.patel@student.edu',
            password: 'BadPassword!',
          });
      }

      // 6th attempt should be blocked by rate limiter
      const blockedRes = await request(app)
        .post('/auth/login')
        .send({
          email: 'aarav.patel@student.edu',
          password: 'BadPassword!',
        });

      assert.equal(blockedRes.status, 429);
      assert.equal(blockedRes.body.error.code, 'RATE_LIMIT_EXCEEDED');
      assert.ok(blockedRes.headers['retry-after'], 'Retry-After header must be present');
    });
  });
});
