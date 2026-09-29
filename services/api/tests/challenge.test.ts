import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { InMemoryAuthRepository } from '../src/modules/auth/auth.repository.js';
import { InMemoryPresenceRepository } from '../src/modules/presence/presence.repository.js';
import { hashPassword } from '../src/core/crypto.js';

describe('Short-Lived Verification Challenge & Anti-Replay Security Suite', () => {
  let authRepo: InMemoryAuthRepository;
  let presenceRepo: InMemoryPresenceRepository;
  let app: ReturnType<typeof createApp>;

  let residentAaravToken: string;
  let residentDiyaToken: string;

  const residentAaravCreds = {
    email: 'aarav.patel@student.edu',
    password: 'ResidentAaravPass!2026',
  };

  const residentDiyaCreds = {
    email: 'diya.sharma@student.edu',
    password: 'ResidentDiyaPass!2026',
  };

  before(async () => {
    authRepo = new InMemoryAuthRepository();
    presenceRepo = new InMemoryPresenceRepository();

    const aaravHash = await hashPassword(residentAaravCreds.password);
    const diyaHash = await hashPassword(residentDiyaCreds.password);

    // Update seeded passwords for Aarav and Diya
    await authRepo.updateUserPasswordAndStatus(
      'c0000000-0000-0000-0000-000000000003',
      aaravHash,
      'ACTIVE'
    );
    await authRepo.updateUserPasswordAndStatus(
      'c0000000-0000-0000-0000-000000000004',
      diyaHash,
      'ACTIVE'
    );

    app = createApp(authRepo, presenceRepo);

    // Login resident Aarav
    const resAarav = await request(app)
      .post('/auth/login')
      .send(residentAaravCreds);
    assert.equal(resAarav.status, 200);
    residentAaravToken = resAarav.body.data.accessToken;

    // Login resident Diya
    const resDiya = await request(app)
      .post('/auth/login')
      .send(residentDiyaCreds);
    assert.equal(resDiya.status, 200);
    residentDiyaToken = resDiya.body.data.accessToken;
  });

  describe('1. Challenge Generation Protocol (POST /verification/challenge/generate)', () => {
    it('should generate a short-lived random challenge with 32-byte hex nonce and server-authoritative 60s TTL', async () => {
      const res = await request(app)
        .post('/verification/challenge/generate')
        .set('Authorization', `Bearer ${residentAaravToken}`)
        .send({
          clientMetadata: { platform: 'ANDROID_14' },
        });

      assert.equal(res.status, 200);
      const data = res.body.data;

      // 1. Verify UUIDs & Nonce
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      assert.match(data.challengeId, uuidRegex);
      assert.match(data.sessionId, uuidRegex);
      assert.equal(data.challengeId, data.sessionId);

      // Nonce must be 32 bytes hex encoded (64 hex characters)
      assert.equal(typeof data.challengeNonce, 'string');
      assert.equal(data.challengeNonce.length, 64);
      assert.match(data.challengeNonce, /^[0-9a-f]{64}$/);

      // 2. Server-Authoritative Clock & Expiry (60 seconds)
      const issuedAt = new Date(data.issuedAt);
      const expiresAt = new Date(data.expiresAt);
      const now = new Date();

      const timeDiff = Math.abs(now.getTime() - issuedAt.getTime());
      assert.ok(timeDiff < 5000, 'issuedAt must reflect real server time');

      const ttlMs = expiresAt.getTime() - issuedAt.getTime();
      assert.equal(ttlMs, 60 * 1000, 'Default TTL must be exactly 60 seconds');
      assert.equal(data.ttlSeconds, 60);

      // 3. Bound Resident and Active Device ID
      assert.equal(data.residentId, 'd0000000-0000-0000-0000-000000000001');
      assert.equal(data.deviceId, 'e0000000-0000-0000-0000-000000000001');
    });

    it('should allow custom bounded TTL parameter up to 300 seconds', async () => {
      const res = await request(app)
        .post('/verification/challenge/generate')
        .set('Authorization', `Bearer ${residentAaravToken}`)
        .send({ ttlSeconds: 120 });

      assert.equal(res.status, 200);
      assert.equal(res.body.data.ttlSeconds, 120);

      const issuedAt = new Date(res.body.data.issuedAt);
      const expiresAt = new Date(res.body.data.expiresAt);
      assert.equal(expiresAt.getTime() - issuedAt.getTime(), 120 * 1000);
    });

    it('should support alias endpoint POST /challenge/generate', async () => {
      const res = await request(app)
        .post('/challenge/generate')
        .set('Authorization', `Bearer ${residentAaravToken}`)
        .send({});

      assert.equal(res.status, 200);
      assert.ok(res.body.data.challengeNonce);
    });
  });

  describe('2. Challenge Verification & Response (POST /verification/challenge/verify)', () => {
    it('should successfully verify and consume a valid challenge within the TTL window', async () => {
      const genRes = await request(app)
        .post('/verification/challenge/generate')
        .set('Authorization', `Bearer ${residentAaravToken}`)
        .send({});
      const { challengeId, challengeNonce } = genRes.body.data;

      const verifyRes = await request(app)
        .post('/verification/challenge/verify')
        .set('Authorization', `Bearer ${residentAaravToken}`)
        .send({
          challengeId,
          challengeNonce,
          biometricConfirmed: true,
        });

      assert.equal(verifyRes.status, 200);
      assert.equal(verifyRes.body.data.challengeId, challengeId);
      assert.equal(verifyRes.body.data.status, 'VERIFIED');
      assert.equal(verifyRes.body.data.biometricVerified, true);
      assert.ok(verifyRes.body.data.verifiedAt);
    });

    it('should support endpoint alias POST /verification/challenge/respond', async () => {
      const genRes = await request(app)
        .post('/challenge/generate')
        .set('Authorization', `Bearer ${residentAaravToken}`)
        .send({});
      const { challengeId, challengeNonce } = genRes.body.data;

      const respondRes = await request(app)
        .post('/verification/challenge/respond')
        .set('Authorization', `Bearer ${residentAaravToken}`)
        .send({
          challengeId,
          challengeNonce,
          biometricConfirmed: true,
        });

      assert.equal(respondRes.status, 200);
      assert.equal(respondRes.body.data.status, 'VERIFIED');
    });
  });

  describe('3. Strict Anti-Replay Protection (Single-Use Nonce)', () => {
    it('should reject replaying an already consumed challenge nonce with HTTP 401 CHALLENGE_ALREADY_USED', async () => {
      // 1. Generate challenge
      const genRes = await request(app)
        .post('/verification/challenge/generate')
        .set('Authorization', `Bearer ${residentAaravToken}`)
        .send({});
      const { challengeId, challengeNonce } = genRes.body.data;

      // 2. First submission succeeds (consumes nonce)
      const firstRes = await request(app)
        .post('/verification/challenge/verify')
        .set('Authorization', `Bearer ${residentAaravToken}`)
        .send({ challengeId, challengeNonce, biometricConfirmed: true });
      assert.equal(firstRes.status, 200);

      // 3. Second submission with identical nonce MUST BE BLOCKED
      const replayRes = await request(app)
        .post('/verification/challenge/verify')
        .set('Authorization', `Bearer ${residentAaravToken}`)
        .send({ challengeId, challengeNonce, biometricConfirmed: true });

      assert.equal(replayRes.status, 401);
      assert.equal(replayRes.body.error.code, 'CHALLENGE_ALREADY_USED');
      assert.match(replayRes.body.error.message, /already been consumed/i);

      // 4. Third attempt also strictly blocked
      const replayRes2 = await request(app)
        .post('/verification/challenge/verify')
        .set('Authorization', `Bearer ${residentAaravToken}`)
        .send({ challengeId, challengeNonce, biometricConfirmed: true });

      assert.equal(replayRes2.status, 401);
      assert.equal(replayRes2.body.error.code, 'CHALLENGE_ALREADY_USED');
    });
  });

  describe('4. Wrong-User Submission Prevention', () => {
    it('should reject verification when Resident B attempts to submit a challenge issued to Resident A', async () => {
      // 1. Resident Aarav initiates challenge
      const genRes = await request(app)
        .post('/verification/challenge/generate')
        .set('Authorization', `Bearer ${residentAaravToken}`)
        .send({});
      const { challengeId, challengeNonce } = genRes.body.data;

      // 2. Resident Diya attempts to submit Aarav's challenge
      const hijackRes = await request(app)
        .post('/verification/challenge/verify')
        .set('Authorization', `Bearer ${residentDiyaToken}`)
        .send({
          challengeId,
          challengeNonce,
          biometricConfirmed: true,
        });

      // Must be safely rejected with HTTP 403 Forbidden
      assert.equal(hijackRes.status, 403);
      assert.equal(hijackRes.body.error.code, 'WRONG_USER_CHALLENGE');
      assert.match(hijackRes.body.error.message, /different resident/i);

      // 3. Confirm challenge remains unconsumed for legitimate owner Aarav
      const aaravRes = await request(app)
        .post('/verification/challenge/verify')
        .set('Authorization', `Bearer ${residentAaravToken}`)
        .send({
          challengeId,
          challengeNonce,
          biometricConfirmed: true,
        });

      assert.equal(aaravRes.status, 200);
      assert.equal(aaravRes.body.data.status, 'VERIFIED');
    });
  });

  describe('5. Server-Side Nonce Expiration', () => {
    it('should reject expired challenges with HTTP 400 CHALLENGE_EXPIRED and ignore client timestamps', async () => {
      // 1. Generate challenge
      const genRes = await request(app)
        .post('/verification/challenge/generate')
        .set('Authorization', `Bearer ${residentAaravToken}`)
        .send({});
      const { challengeId, challengeNonce } = genRes.body.data;

      // 2. Simulate expiration by shifting challengeExpiresAt into the past
      await presenceRepo.updateVerificationAttempt(challengeId, {
        challengeExpiresAt: new Date(Date.now() - 5000), // Expired 5 seconds ago
      });

      // 3. Resident attempts submission, sending a fake client timestamp claiming it's still valid
      const res = await request(app)
        .post('/verification/challenge/verify')
        .set('Authorization', `Bearer ${residentAaravToken}`)
        .send({
          challengeId,
          challengeNonce,
          biometricConfirmed: true,
          clientTimestamp: '1999-01-01T00:00:00.000Z', // Fake client time
        });

      // Server must reject strictly using its own clock
      assert.equal(res.status, 400);
      assert.equal(res.body.error.code, 'CHALLENGE_EXPIRED');
      assert.match(res.body.error.message, /challenge expired/i);

      // 4. Further submission attempts should be blocked as terminated/duplicate
      const retryRes = await request(app)
        .post('/verification/challenge/verify')
        .set('Authorization', `Bearer ${residentAaravToken}`)
        .send({ challengeId, challengeNonce, biometricConfirmed: true });

      assert.equal(retryRes.status, 409);
      assert.equal(retryRes.body.error.code, 'DUPLICATE_CHALLENGE_SUBMISSION');
    });
  });

  describe('6. Cryptographic Proof Tampering Protection', () => {
    it('should reject tampered or incorrect nonces with HTTP 401 INVALID_CHALLENGE_PROOF', async () => {
      const genRes = await request(app)
        .post('/verification/challenge/generate')
        .set('Authorization', `Bearer ${residentAaravToken}`)
        .send({});
      const { challengeId } = genRes.body.data;

      // Submit fabricated nonce
      const forgedNonce = 'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff';
      const res = await request(app)
        .post('/verification/challenge/verify')
        .set('Authorization', `Bearer ${residentAaravToken}`)
        .send({
          challengeId,
          challengeNonce: forgedNonce,
          biometricConfirmed: true,
        });

      assert.equal(res.status, 401);
      assert.equal(res.body.error.code, 'INVALID_CHALLENGE_PROOF');
    });
  });

  describe('7. Idempotency Support', () => {
    it('should return identical response when repeated with the same Idempotency-Key', async () => {
      const genRes = await request(app)
        .post('/verification/challenge/generate')
        .set('Authorization', `Bearer ${residentAaravToken}`)
        .send({});
      const { challengeId, challengeNonce } = genRes.body.data;

      const idempotencyKey = 'idem-challenge-key-12345';

      // First submission
      const res1 = await request(app)
        .post('/verification/challenge/verify')
        .set('Authorization', `Bearer ${residentAaravToken}`)
        .set('Idempotency-Key', idempotencyKey)
        .send({ challengeId, challengeNonce, biometricConfirmed: true });

      assert.equal(res1.status, 200);

      // Repeated submission with same idempotency key
      const res2 = await request(app)
        .post('/verification/challenge/verify')
        .set('Authorization', `Bearer ${residentAaravToken}`)
        .set('Idempotency-Key', idempotencyKey)
        .send({ challengeId, challengeNonce, biometricConfirmed: true });

      assert.equal(res2.status, 200);
      assert.equal(res2.body.data.challengeId, res1.body.data.challengeId);
      assert.equal(res2.body.data.verifiedAt, res1.body.data.verifiedAt);
    });
  });
});
