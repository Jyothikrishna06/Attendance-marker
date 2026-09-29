import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { InMemoryAuthRepository } from '../src/modules/auth/auth.repository.js';
import { InMemoryPresenceRepository } from '../src/modules/presence/presence.repository.js';
import { hashPassword } from '../src/core/crypto.js';

describe('Presence Entry & Exit Security Test Suite', () => {
  let authRepo: InMemoryAuthRepository;
  let presenceRepo: InMemoryPresenceRepository;
  let app: ReturnType<typeof createApp>;

  let residentToken: string;
  let wardenToken: string;
  let residentAaravId: string;

  beforeEach(async () => {
    authRepo = new InMemoryAuthRepository();
    presenceRepo = new InMemoryPresenceRepository();

    const residentPass = await hashPassword('ResidentPass!2026');
    const wardenPass = await hashPassword('WardenPass!2026');

    // Update seeded passwords
    await authRepo.updateUserPasswordAndStatus(
      'c0000000-0000-0000-0000-000000000003',
      residentPass,
      'ACTIVE'
    );
    await authRepo.updateUserPasswordAndStatus(
      'c0000000-0000-0000-0000-000000000002',
      wardenPass,
      'ACTIVE'
    );

    app = createApp(authRepo, presenceRepo);

    // Login resident Aarav
    const resAarav = await request(app)
      .post('/auth/login')
      .send({ email: 'aarav.patel@student.edu', password: 'ResidentPass!2026' });
    residentToken = resAarav.body.data.accessToken;
    residentAaravId = resAarav.body.data.user.residentProfile.id;

    // Login Warden Sharma
    const resWarden = await request(app)
      .post('/auth/login')
      .send({ email: 'warden.sharma@hostel.edu', password: 'WardenPass!2026' });
    wardenToken = resWarden.body.data.accessToken;
  });

  // ----------------------------------------------------------------------------
  // 1. Full Presence Lifecycle: Start Entry -> Verify -> GET /me -> Exit
  // ----------------------------------------------------------------------------
  describe('Full Presence Lifecycle', () => {
    it('should complete entry start, verification, status check, and exit', async () => {
      // 1. Start Entry
      const startRes = await request(app)
        .post('/presence/entry/start')
        .set('Authorization', `Bearer ${residentToken}`)
        .send();

      assert.equal(startRes.status, 200);
      assert.ok(startRes.body.data.sessionId, 'Session ID must be generated');
      assert.ok(startRes.body.data.challengeNonce, 'Challenge nonce must be generated');
      assert.equal(startRes.body.data.residentId, residentAaravId);

      const { sessionId, challengeNonce } = startRes.body.data;

      // 2. Verify Entry
      const verifyRes = await request(app)
        .post('/presence/entry/verify')
        .set('Authorization', `Bearer ${residentToken}`)
        .send({
          sessionId,
          challengeNonce,
          biometricConfirmed: true,
          networkMetadata: { bssid: 'hostel-ap-north-1', subnet: '10.42.0.0/16' },
        });

      assert.equal(verifyRes.status, 200);
      assert.equal(verifyRes.body.data.status, 'VERIFIED_INSIDE');
      assert.equal(verifyRes.body.data.eventType, 'ENTRY');
      assert.ok(verifyRes.body.data.eventId);
      assert.ok(verifyRes.body.data.serverTimestamp);

      // 3. GET /presence/me confirms inside
      const meRes = await request(app)
        .get('/presence/me')
        .set('Authorization', `Bearer ${residentToken}`);

      assert.equal(meRes.status, 200);
      assert.equal(meRes.body.data.currentStatus, 'VERIFIED_INSIDE');
      assert.equal(meRes.body.data.lastEventType, 'ENTRY');
      assert.equal(meRes.body.data.recentEvents.length, 1);

      // 4. Record Exit
      const exitRes = await request(app)
        .post('/presence/exit')
        .set('Authorization', `Bearer ${residentToken}`)
        .send({ reason: 'Going to campus library' });

      assert.equal(exitRes.status, 200);
      assert.equal(exitRes.body.data.status, 'VERIFIED_OUTSIDE');
      assert.equal(exitRes.body.data.eventType, 'EXIT');

      // 5. GET /presence/me confirms outside
      const meAfterExit = await request(app)
        .get('/presence/me')
        .set('Authorization', `Bearer ${residentToken}`);

      assert.equal(meAfterExit.body.data.currentStatus, 'VERIFIED_OUTSIDE');
      assert.equal(meAfterExit.body.data.recentEvents.length, 2);
    });
  });

  // ----------------------------------------------------------------------------
  // 2. Authoritative Server Timestamp Validation
  // ----------------------------------------------------------------------------
  describe('Authoritative Server Timestamps', () => {
    it('must ignore client-provided timestamps and generate server-side timestamps and UUIDs', async () => {
      const spoofedClientTime = '1995-12-17T03:24:00.000Z';

      // Start Entry
      const startRes = await request(app)
        .post('/presence/entry/start')
        .set('Authorization', `Bearer ${residentToken}`)
        .send({ clientTimestamp: spoofedClientTime });

      const { sessionId, challengeNonce } = startRes.body.data;

      // Verify Entry with spoofed timestamp
      const verifyRes = await request(app)
        .post('/presence/entry/verify')
        .set('Authorization', `Bearer ${residentToken}`)
        .send({
          sessionId,
          challengeNonce,
          biometricConfirmed: true,
          clientTimestamp: spoofedClientTime,
        });

      assert.equal(verifyRes.status, 200);
      const serverTimestamp = new Date(verifyRes.body.data.serverTimestamp);
      const now = new Date();

      // Ensure serverTimestamp reflects real current time (+/- 10 seconds), NOT 1995!
      const diffMs = Math.abs(serverTimestamp.getTime() - now.getTime());
      assert.ok(diffMs < 10000, 'Server timestamp must be generated on server clock');
      assert.notEqual(verifyRes.body.data.serverTimestamp, spoofedClientTime);

      // Verify eventId is valid UUID v4 format
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      assert.match(verifyRes.body.data.eventId, uuidRegex);
    });
  });

  // ----------------------------------------------------------------------------
  // 3. Duplicate Active Entry Prevention
  // ----------------------------------------------------------------------------
  describe('Duplicate Active Entry Prevention', () => {
    it('should reject starting a new entry if the resident is already verified inside', async () => {
      // 1. Complete first entry
      const startRes = await request(app)
        .post('/presence/entry/start')
        .set('Authorization', `Bearer ${residentToken}`)
        .send();

      await request(app)
        .post('/presence/entry/verify')
        .set('Authorization', `Bearer ${residentToken}`)
        .send({
          sessionId: startRes.body.data.sessionId,
          challengeNonce: startRes.body.data.challengeNonce,
          biometricConfirmed: true,
        });

      // 2. Attempt second entry while still verified inside -> MUST FAIL with 409
      const secondStartRes = await request(app)
        .post('/presence/entry/start')
        .set('Authorization', `Bearer ${residentToken}`)
        .send();

      assert.equal(secondStartRes.status, 409);
      assert.equal(secondStartRes.body.error.code, 'CONFLICT');
      assert.match(secondStartRes.body.error.message, /Duplicate active entry rejected/);
    });
  });

  // ----------------------------------------------------------------------------
  // 4. Anti-Replay & Challenge Validation
  // ----------------------------------------------------------------------------
  describe('Anti-Replay & Challenge Validation', () => {
    it('should reject reusing an already consumed challenge nonce (Anti-Replay)', async () => {
      const startRes = await request(app)
        .post('/presence/entry/start')
        .set('Authorization', `Bearer ${residentToken}`)
        .send();

      const { sessionId, challengeNonce } = startRes.body.data;

      // First submission succeeds
      const firstVerify = await request(app)
        .post('/presence/entry/verify')
        .set('Authorization', `Bearer ${residentToken}`)
        .send({ sessionId, challengeNonce, biometricConfirmed: true });
      assert.equal(firstVerify.status, 200);

      // Second submission with identical nonce MUST BE REJECTED
      const replayVerify = await request(app)
        .post('/presence/entry/verify')
        .set('Authorization', `Bearer ${residentToken}`)
        .send({ sessionId, challengeNonce, biometricConfirmed: true });

      assert.equal(replayVerify.status, 401);
      assert.equal(replayVerify.body.error.code, 'CHALLENGE_ALREADY_USED');
    });

    it('should reject entry if native biometric confirmation failed or was canceled', async () => {
      const startRes = await request(app)
        .post('/presence/entry/start')
        .set('Authorization', `Bearer ${residentToken}`)
        .send();

      const { sessionId, challengeNonce } = startRes.body.data;

      const failVerify = await request(app)
        .post('/presence/entry/verify')
        .set('Authorization', `Bearer ${residentToken}`)
        .send({
          sessionId,
          challengeNonce,
          biometricConfirmed: false, // User canceled or failed fingerprint
        });

      assert.equal(failVerify.status, 401);
      assert.equal(failVerify.body.error.code, 'BIOMETRIC_FAILED');
    });

    it('should reject entry if challenge nonce hash is invalid', async () => {
      const startRes = await request(app)
        .post('/presence/entry/start')
        .set('Authorization', `Bearer ${residentToken}`)
        .send();

      const failVerify = await request(app)
        .post('/presence/entry/verify')
        .set('Authorization', `Bearer ${residentToken}`)
        .send({
          sessionId: startRes.body.data.sessionId,
          challengeNonce: 'fake_tampered_challenge_nonce_12345',
          biometricConfirmed: true,
        });

      assert.equal(failVerify.status, 401);
      assert.equal(failVerify.body.error.code, 'INVALID_CHALLENGE_PROOF');
    });
  });

  // ----------------------------------------------------------------------------
  // 5. Idempotent Verification & Exit Handling
  // ----------------------------------------------------------------------------
  describe('Idempotency Guardrails', () => {
    it('should return identical response when repeated with the same Idempotency-Key without creating duplicate records', async () => {
      const startRes = await request(app)
        .post('/presence/entry/start')
        .set('Authorization', `Bearer ${residentToken}`)
        .send();

      const { sessionId, challengeNonce } = startRes.body.data;
      const idempotencyKey = 'unique-mobile-client-request-uuid-1';

      // 1. First execution
      const res1 = await request(app)
        .post('/presence/entry/verify')
        .set('Authorization', `Bearer ${residentToken}`)
        .set('Idempotency-Key', idempotencyKey)
        .send({ sessionId, challengeNonce, biometricConfirmed: true });

      assert.equal(res1.status, 200);
      const eventId1 = res1.body.data.eventId;

      // 2. Second execution with identical idempotency key
      const res2 = await request(app)
        .post('/presence/entry/verify')
        .set('Authorization', `Bearer ${residentToken}`)
        .set('Idempotency-Key', idempotencyKey)
        .send({ sessionId, challengeNonce, biometricConfirmed: true });

      assert.equal(res2.status, 200);
      assert.equal(res2.body.data.eventId, eventId1, 'Must return same eventId');

      // 3. Confirm repository has exactly 1 event
      const allEvents = await presenceRepo.findPresenceEventsByResidentId(residentAaravId);
      assert.equal(allEvents.length, 1, 'Only one presence record should be created');
    });
  });

  // ----------------------------------------------------------------------------
  // 6. Role Authorization & Presence Status
  // ----------------------------------------------------------------------------
  describe('RBAC & Role Separation on Presence Endpoints', () => {
    it('should reject non-resident users from calling resident presence actions', async () => {
      // Warden cannot start presence verification for themselves
      const startRes = await request(app)
        .post('/presence/entry/start')
        .set('Authorization', `Bearer ${wardenToken}`)
        .send();

      assert.equal(startRes.status, 403);
      assert.equal(startRes.body.error.code, 'ROLE_NOT_AUTHORIZED');
    });

    it('should allow Warden to query hostel presence status overview', async () => {
      const statusRes = await request(app)
        .get('/presence/status')
        .set('Authorization', `Bearer ${wardenToken}`);

      assert.equal(statusRes.status, 200);
      assert.ok(statusRes.body.data.summary);
      assert.ok(Array.isArray(statusRes.body.data.roster));
    });

    it('should prevent a resident from querying status of other residents', async () => {
      const statusRes = await request(app)
        .get('/presence/status?residentId=d0000000-0000-0000-0000-000000000002')
        .set('Authorization', `Bearer ${residentToken}`);

      assert.equal(statusRes.status, 403);
    });
  });
});
