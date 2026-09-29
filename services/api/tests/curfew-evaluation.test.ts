import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { InMemoryAuthRepository } from '../src/modules/auth/auth.repository.js';
import { InMemoryPresenceRepository } from '../src/modules/presence/presence.repository.js';
import { InMemoryAdminRepository } from '../src/modules/admin/admin.repository.js';
import { InMemoryCurfewEvaluationRepository } from '../src/modules/curfew-evaluation/curfew-evaluation.repository.js';
import {
  constructCurfewDeadlines,
  evaluateResidentCurfew,
} from '../src/modules/curfew-evaluation/curfew-evaluation.engine.js';
import {
  CurfewEvaluationContext,
  ResidentEvaluationInput,
} from '../src/modules/curfew-evaluation/curfew-evaluation.types.js';
import {
  CurfewRule,
  LeaveRequest,
  PresenceEvent,
  VerificationAttempt,
} from '../src/common/types.js';
import { hashPassword } from '../src/core/crypto.js';

describe('Curfew Evaluation Engine & State Machine Suite', () => {
  // Base rule for unit tests: 21:30:00 with 15 minute grace period
  const defaultRule: CurfewRule = {
    id: 'rule-001',
    hostelId: 'hostel-001',
    dayOfWeek: null,
    curfewTime: '21:30:00',
    gracePeriodMinutes: 15,
    isActive: true,
    effectiveFrom: '2026-01-01',
    effectiveTo: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const testDate = '2026-09-29';
  const testTz = '+05:30';

  const { curfewDeadline, graceDeadline } = constructCurfewDeadlines(
    testDate,
    defaultRule.curfewTime,
    defaultRule.gracePeriodMinutes,
    testTz
  );

  // Helper to construct context at a specific evaluation time
  const createContext = (evalTime: Date): CurfewEvaluationContext => ({
    hostelId: 'hostel-001',
    date: testDate,
    curfewRule: defaultRule,
    curfewDeadline,
    graceDeadline,
    evaluationTime: evalTime,
    timezone: testTz,
  });

  describe('1. Timezone Boundary Rules', () => {
    it('should correctly calculate deadlines for IST (+05:30) across UTC midnight', () => {
      // 21:30:00 IST on 2026-09-29 is 16:00:00 UTC on 2026-09-29
      const result = constructCurfewDeadlines('2026-09-29', '21:30:00', 15, '+05:30');
      assert.equal(result.curfewDeadline.toISOString(), '2026-09-29T16:00:00.000Z');
      assert.equal(result.graceDeadline.toISOString(), '2026-09-29T16:15:00.000Z');
      assert.equal(result.dayOfWeek, 2); // Tuesday
    });

    it('should correctly calculate deadlines for UTC (+00:00 / Z)', () => {
      const result = constructCurfewDeadlines('2026-09-29', '22:00:00', 30, 'UTC');
      assert.equal(result.curfewDeadline.toISOString(), '2026-09-29T22:00:00.000Z');
      assert.equal(result.graceDeadline.toISOString(), '2026-09-29T22:30:00.000Z');
    });

    it('should handle negative timezone offsets (EDT -04:00) that roll over into next UTC day', () => {
      // 21:30:00 EDT on 2026-09-29 is 01:30:00 UTC on 2026-09-30
      const result = constructCurfewDeadlines('2026-09-29', '21:30:00', 15, '-04:00');
      assert.equal(result.curfewDeadline.toISOString(), '2026-09-30T01:30:00.000Z');
      assert.equal(result.graceDeadline.toISOString(), '2026-09-30T01:45:00.000Z');
      assert.equal(result.dayOfWeek, 2); // Still calendar Tuesday 2026-09-29
    });

    it('should normalize HH:MM time strings without seconds', () => {
      const result = constructCurfewDeadlines('2026-09-29', '21:30', 15, '+05:30');
      assert.equal(result.curfewDeadline.toISOString(), '2026-09-29T16:00:00.000Z');
    });
  });

  describe('2. Core Status Resolutions', () => {
    it('should resolve to VERIFIED_INSIDE when entry occurred before curfew deadline', () => {
      const evalTime = new Date('2026-09-29T17:00:00.000Z'); // 22:30 IST (after curfew)
      const context = createContext(evalTime);

      const entryEvent: PresenceEvent = {
        id: 'event-001',
        residentId: 'res-001',
        eventType: 'ENTRY',
        source: 'VERIFICATION_SESSION',
        serverTimestamp: new Date('2026-09-29T15:30:00.000Z'), // 21:00 IST (before 21:30)
        eventTimestamp: new Date('2026-09-29T15:30:00.000Z'),
        curfewDate: testDate,
        status: 'VERIFIED_INSIDE',
        networkEvidence: {},
        createdAt: new Date(),
      };

      const result = evaluateResidentCurfew(context, {
        residentId: 'res-001',
        leaveRequests: [],
        presenceEvents: [entryEvent],
        verificationAttempts: [],
      });

      assert.equal(result.status, 'VERIFIED_INSIDE');
      assert.equal(result.isLateReturn, false);
      assert.equal(result.resolvedEventId, 'event-001');
    });

    it('should resolve to VERIFIED_INSIDE when entry occurred during grace window (e.g. 21:38 IST)', () => {
      const evalTime = new Date('2026-09-29T17:00:00.000Z');
      const context = createContext(evalTime);

      const entryEvent: PresenceEvent = {
        id: 'event-002',
        residentId: 'res-001',
        eventType: 'ENTRY',
        source: 'VERIFICATION_SESSION',
        // 21:38 IST = 16:08 UTC (Curfew is 16:00 UTC, Grace is 16:15 UTC)
        serverTimestamp: new Date('2026-09-29T16:08:00.000Z'),
        eventTimestamp: new Date('2026-09-29T16:08:00.000Z'),
        curfewDate: testDate,
        status: 'VERIFIED_INSIDE',
        networkEvidence: {},
        createdAt: new Date(),
      };

      const result = evaluateResidentCurfew(context, {
        residentId: 'res-001',
        leaveRequests: [],
        presenceEvents: [entryEvent],
        verificationAttempts: [],
      });

      assert.equal(result.status, 'VERIFIED_INSIDE');
      assert.equal(result.isLateReturn, false);
    });

    it('should resolve to VERIFICATION_FAILED if presence event was flagged by warden', () => {
      const evalTime = new Date('2026-09-29T17:00:00.000Z');
      const context = createContext(evalTime);

      const flaggedEvent: PresenceEvent = {
        id: 'event-flagged',
        residentId: 'res-001',
        eventType: 'ENTRY',
        source: 'WARDEN_MANUAL',
        serverTimestamp: new Date('2026-09-29T15:45:00.000Z'),
        eventTimestamp: new Date('2026-09-29T15:45:00.000Z'),
        curfewDate: testDate,
        status: 'FLAGGED',
        networkEvidence: { reason: 'Unauthorized proxy check-in' },
        createdAt: new Date(),
      };

      const result = evaluateResidentCurfew(context, {
        residentId: 'res-001',
        leaveRequests: [],
        presenceEvents: [flaggedEvent],
        verificationAttempts: [],
      });

      assert.equal(result.status, 'VERIFICATION_FAILED');
      assert.equal(result.resolvedEventId, 'event-flagged');
    });

    it('should resolve to VERIFICATION_FAILED if single verification attempt failed and no entry followed', () => {
      const evalTime = new Date('2026-09-29T17:00:00.000Z');
      const context = createContext(evalTime);

      const failedAttempt: VerificationAttempt = {
        id: 'attempt-failed-001',
        residentId: 'res-001',
        deviceId: 'dev-001',
        sessionNonceHash: 'hash123',
        challengeIssuedAt: new Date('2026-09-29T16:05:00.000Z'),
        challengeExpiresAt: new Date('2026-09-29T16:06:00.000Z'),
        biometricVerified: false,
        networkVerified: false,
        status: 'FAILED',
        failureReason: 'IP_NOT_IN_AUTHORIZED_SUBNET',
        consumedAt: null,
        clientMetadata: {},
        createdAt: new Date('2026-09-29T16:05:00.000Z'),
        updatedAt: new Date('2026-09-29T16:05:00.000Z'),
      };

      const result = evaluateResidentCurfew(context, {
        residentId: 'res-001',
        leaveRequests: [],
        presenceEvents: [],
        verificationAttempts: [failedAttempt],
      });

      assert.equal(result.status, 'VERIFICATION_FAILED');
      assert.match(result.statusReason, /IP_NOT_IN_AUTHORIZED_SUBNET/);
    });
  });

  describe('3. Late Returns Handling', () => {
    it('should mark resident as NOT_VERIFIED with isLateReturn: true when entry occurs after grace deadline', () => {
      const evalTime = new Date('2026-09-29T17:30:00.000Z'); // 23:00 IST
      const context = createContext(evalTime);

      // Curfew deadline is 16:00 UTC (21:30 IST), Grace deadline is 16:15 UTC (21:45 IST)
      // Student entered at 16:45 UTC (22:15 IST) -> 30 minutes late!
      const lateEntry: PresenceEvent = {
        id: 'event-late',
        residentId: 'res-001',
        eventType: 'ENTRY',
        source: 'VERIFICATION_SESSION',
        serverTimestamp: new Date('2026-09-29T16:45:00.000Z'),
        eventTimestamp: new Date('2026-09-29T16:45:00.000Z'),
        curfewDate: testDate,
        status: 'VERIFIED_INSIDE',
        networkEvidence: {},
        createdAt: new Date(),
      };

      const result = evaluateResidentCurfew(context, {
        residentId: 'res-001',
        leaveRequests: [],
        presenceEvents: [lateEntry],
        verificationAttempts: [],
      });

      assert.equal(result.status, 'NOT_VERIFIED');
      assert.equal(result.isLateReturn, true);
      assert.equal(result.lateMinutes, 30);
      assert.equal(result.resolvedEventId, 'event-late');
      assert.match(result.statusReason, /30 minute\(s\) past/);
    });
  });

  describe('4. Approved Leave Overlap Rules', () => {
    it('should resolve to APPROVED_LEAVE when approved leave covers curfew window', () => {
      const evalTime = new Date('2026-09-29T17:00:00.000Z');
      const context = createContext(evalTime);

      // Leave: 2026-09-29 14:00 UTC to 2026-09-30 04:00 UTC (Overnight outpass)
      const approvedLeave: LeaveRequest = {
        id: 'leave-001',
        residentId: 'res-001',
        leaveType: 'NIGHT_OUT',
        startTime: new Date('2026-09-29T14:00:00.000Z'),
        endTime: new Date('2026-09-30T04:00:00.000Z'),
        reason: 'National Robotics Hackathon',
        status: 'APPROVED',
        approverId: 'warden-001',
        decisionReason: 'Verified event pass',
        decisionTimestamp: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const result = evaluateResidentCurfew(context, {
        residentId: 'res-001',
        leaveRequests: [approvedLeave],
        presenceEvents: [],
        verificationAttempts: [],
      });

      assert.equal(result.status, 'APPROVED_LEAVE');
      assert.equal(result.resolvedLeaveId, 'leave-001');
      assert.equal(result.isLateReturn, false);
    });

    it('should NOT excuse student if approved leave expired before curfew (e.g. ended at 19:00 IST)', () => {
      const evalTime = new Date('2026-09-29T17:00:00.000Z'); // 22:30 IST
      const context = createContext(evalTime);

      // Leave ended at 13:30 UTC (19:00 IST), while curfew deadline is 16:00 UTC (21:30 IST)
      const expiredLeave: LeaveRequest = {
        id: 'leave-expired',
        residentId: 'res-001',
        leaveType: 'OUTPASS',
        startTime: new Date('2026-09-29T08:00:00.000Z'),
        endTime: new Date('2026-09-29T13:30:00.000Z'),
        reason: 'Market visit',
        status: 'APPROVED',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const result = evaluateResidentCurfew(context, {
        residentId: 'res-001',
        leaveRequests: [expiredLeave],
        presenceEvents: [],
        verificationAttempts: [],
      });

      // Since leave ended at 19:00 and student never checked in, they are NOT_VERIFIED!
      assert.equal(result.status, 'NOT_VERIFIED');
    });

    it('should NOT excuse student if leave request was REJECTED or PENDING', () => {
      const evalTime = new Date('2026-09-29T17:00:00.000Z');
      const context = createContext(evalTime);

      const pendingLeave: LeaveRequest = {
        id: 'leave-pending',
        residentId: 'res-001',
        leaveType: 'NIGHT_OUT',
        startTime: new Date('2026-09-29T14:00:00.000Z'),
        endTime: new Date('2026-09-30T04:00:00.000Z'),
        reason: 'Unapproved absence attempt',
        status: 'PENDING',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const result = evaluateResidentCurfew(context, {
        residentId: 'res-001',
        leaveRequests: [pendingLeave],
        presenceEvents: [],
        verificationAttempts: [],
      });

      assert.equal(result.status, 'NOT_VERIFIED');
    });
  });

  describe('5. Duplicate & Interleaved Presence Events', () => {
    it('should resolve duplicate consecutive ENTRY events seamlessly', () => {
      const evalTime = new Date('2026-09-29T17:00:00.000Z');
      const context = createContext(evalTime);

      // Student taps verify twice in quick succession
      const entry1: PresenceEvent = {
        id: 'ev-1',
        residentId: 'res-001',
        eventType: 'ENTRY',
        source: 'VERIFICATION_SESSION',
        serverTimestamp: new Date('2026-09-29T15:40:00.000Z'),
        eventTimestamp: new Date('2026-09-29T15:40:00.000Z'),
        curfewDate: testDate,
        status: 'VERIFIED_INSIDE',
        networkEvidence: {},
        createdAt: new Date(),
      };
      const entry2: PresenceEvent = {
        id: 'ev-2',
        residentId: 'res-001',
        eventType: 'ENTRY',
        source: 'VERIFICATION_SESSION',
        serverTimestamp: new Date('2026-09-29T15:40:05.000Z'),
        eventTimestamp: new Date('2026-09-29T15:40:05.000Z'),
        curfewDate: testDate,
        status: 'VERIFIED_INSIDE',
        networkEvidence: {},
        createdAt: new Date(),
      };

      const result = evaluateResidentCurfew(context, {
        residentId: 'res-001',
        leaveRequests: [],
        presenceEvents: [entry1, entry2],
        verificationAttempts: [],
      });

      assert.equal(result.status, 'VERIFIED_INSIDE');
      assert.equal(result.resolvedEventId, 'ev-2'); // Latest entry confirms state
    });

    it('should track exit followed by re-entry correctly', () => {
      const evalTime = new Date('2026-09-29T17:00:00.000Z');
      const context = createContext(evalTime);

      const entryEarly: PresenceEvent = {
        id: 'ev-early',
        residentId: 'res-001',
        eventType: 'ENTRY',
        source: 'VERIFICATION_SESSION',
        serverTimestamp: new Date('2026-09-29T12:00:00.000Z'), // 17:30 IST
        eventTimestamp: new Date('2026-09-29T12:00:00.000Z'),
        curfewDate: testDate,
        status: 'VERIFIED_INSIDE',
        networkEvidence: {},
        createdAt: new Date(),
      };
      const exitMid: PresenceEvent = {
        id: 'ev-exit',
        residentId: 'res-001',
        eventType: 'EXIT',
        source: 'VERIFICATION_SESSION',
        serverTimestamp: new Date('2026-09-29T14:00:00.000Z'), // 19:30 IST
        eventTimestamp: new Date('2026-09-29T14:00:00.000Z'),
        curfewDate: testDate,
        status: 'VERIFIED_OUTSIDE',
        networkEvidence: {},
        createdAt: new Date(),
      };
      const entryFinal: PresenceEvent = {
        id: 'ev-final',
        residentId: 'res-001',
        eventType: 'ENTRY',
        source: 'VERIFICATION_SESSION',
        serverTimestamp: new Date('2026-09-29T15:50:00.000Z'), // 21:20 IST (before 21:30)
        eventTimestamp: new Date('2026-09-29T15:50:00.000Z'),
        curfewDate: testDate,
        status: 'VERIFIED_INSIDE',
        networkEvidence: {},
        createdAt: new Date(),
      };

      const result = evaluateResidentCurfew(context, {
        residentId: 'res-001',
        leaveRequests: [],
        presenceEvents: [entryEarly, exitMid, entryFinal],
        verificationAttempts: [],
      });

      assert.equal(result.status, 'VERIFIED_INSIDE');
      assert.equal(result.resolvedEventId, 'ev-final');
    });

    it('should recognize when resident exited and never re-entered before curfew', () => {
      const evalTime = new Date('2026-09-29T17:00:00.000Z');
      const context = createContext(evalTime);

      const entryEarly: PresenceEvent = {
        id: 'ev-early',
        residentId: 'res-001',
        eventType: 'ENTRY',
        source: 'VERIFICATION_SESSION',
        serverTimestamp: new Date('2026-09-29T12:00:00.000Z'),
        eventTimestamp: new Date('2026-09-29T12:00:00.000Z'),
        curfewDate: testDate,
        status: 'VERIFIED_INSIDE',
        networkEvidence: {},
        createdAt: new Date(),
      };
      const exitFinal: PresenceEvent = {
        id: 'ev-exit-final',
        residentId: 'res-001',
        eventType: 'EXIT',
        source: 'VERIFICATION_SESSION',
        serverTimestamp: new Date('2026-09-29T14:30:00.000Z'), // 20:00 IST
        eventTimestamp: new Date('2026-09-29T14:30:00.000Z'),
        curfewDate: testDate,
        status: 'VERIFIED_OUTSIDE',
        networkEvidence: {},
        createdAt: new Date(),
      };

      const result = evaluateResidentCurfew(context, {
        residentId: 'res-001',
        leaveRequests: [],
        presenceEvents: [entryEarly, exitFinal],
        verificationAttempts: [],
      });

      assert.equal(result.status, 'NOT_VERIFIED');
    });
  });

  describe('6. Missing Event Windows (Temporal Transitions)', () => {
    it('should return PENDING_VERIFICATION if evaluated prior to curfew deadline (e.g. 21:00 IST)', () => {
      // 21:00 IST = 15:30 UTC (< 16:00 UTC curfew deadline)
      const evalTime = new Date('2026-09-29T15:30:00.000Z');
      const context = createContext(evalTime);

      const result = evaluateResidentCurfew(context, {
        residentId: 'res-001',
        leaveRequests: [],
        presenceEvents: [],
        verificationAttempts: [],
      });

      assert.equal(result.status, 'PENDING_VERIFICATION');
    });

    it('should return PENDING_VERIFICATION if evaluated during grace window (e.g. 21:35 IST)', () => {
      // 21:35 IST = 16:05 UTC (between 16:00 curfew and 16:15 grace)
      const evalTime = new Date('2026-09-29T16:05:00.000Z');
      const context = createContext(evalTime);

      const result = evaluateResidentCurfew(context, {
        residentId: 'res-001',
        leaveRequests: [],
        presenceEvents: [],
        verificationAttempts: [],
      });

      assert.equal(result.status, 'PENDING_VERIFICATION');
    });

    it('should transition to NOT_VERIFIED once grace period expires (e.g. 21:46 IST)', () => {
      // 21:46 IST = 16:16 UTC (> 16:15 grace deadline)
      const evalTime = new Date('2026-09-29T16:16:00.000Z');
      const context = createContext(evalTime);

      const result = evaluateResidentCurfew(context, {
        residentId: 'res-001',
        leaveRequests: [],
        presenceEvents: [],
        verificationAttempts: [],
      });

      assert.equal(result.status, 'NOT_VERIFIED');
    });
  });

  describe('7. Failure Recovery via Successful Re-try', () => {
    it('should resolve to VERIFIED_INSIDE if student recovered from a transient failure with a successful entry', () => {
      const evalTime = new Date('2026-09-29T17:00:00.000Z');
      const context = createContext(evalTime);

      // Student failed at 21:05 IST due to network glitch
      const failedAttempt: VerificationAttempt = {
        id: 'attempt-fail',
        residentId: 'res-001',
        deviceId: 'dev-001',
        sessionNonceHash: 'hashfail',
        challengeIssuedAt: new Date('2026-09-29T15:35:00.000Z'),
        challengeExpiresAt: new Date('2026-09-29T15:36:00.000Z'),
        biometricVerified: false,
        networkVerified: false,
        status: 'FAILED',
        failureReason: 'IP_NOT_IN_AUTHORIZED_SUBNET',
        consumedAt: null,
        clientMetadata: {},
        createdAt: new Date('2026-09-29T15:35:00.000Z'),
        updatedAt: new Date('2026-09-29T15:35:00.000Z'),
      };

      // Student moved closer to AP and successfully verified at 21:10 IST
      const successEntry: PresenceEvent = {
        id: 'event-success',
        residentId: 'res-001',
        eventType: 'ENTRY',
        source: 'VERIFICATION_SESSION',
        serverTimestamp: new Date('2026-09-29T15:40:00.000Z'),
        eventTimestamp: new Date('2026-09-29T15:40:00.000Z'),
        curfewDate: testDate,
        status: 'VERIFIED_INSIDE',
        networkEvidence: {},
        createdAt: new Date(),
      };

      const result = evaluateResidentCurfew(context, {
        residentId: 'res-001',
        leaveRequests: [],
        presenceEvents: [successEntry],
        verificationAttempts: [failedAttempt],
      });

      assert.equal(result.status, 'VERIFIED_INSIDE');
      assert.equal(result.resolvedEventId, 'event-success');
    });
  });

  describe('8. End-to-End Curfew Evaluation Service & API Integration', () => {
    let authRepo: InMemoryAuthRepository;
    let presenceRepo: InMemoryPresenceRepository;
    let adminRepo: InMemoryAdminRepository;
    let curfewEvalRepo: InMemoryCurfewEvaluationRepository;
    let app: ReturnType<typeof createApp>;

    let wardenToken: string;
    let residentToken: string;

    before(async () => {
      authRepo = new InMemoryAuthRepository();
      presenceRepo = new InMemoryPresenceRepository();
      adminRepo = new InMemoryAdminRepository();
      curfewEvalRepo = new InMemoryCurfewEvaluationRepository();

      const wardenHash = await hashPassword('WardenSecurePass!2026');
      const residentHash = await hashPassword('ResidentAaravPass!2026');

      await authRepo.updateUserPasswordAndStatus('c0000000-0000-0000-0000-000000000002', wardenHash, 'ACTIVE');
      await authRepo.updateUserPasswordAndStatus('c0000000-0000-0000-0000-000000000003', residentHash, 'ACTIVE');

      app = createApp(authRepo, presenceRepo, undefined, adminRepo, curfewEvalRepo);

      // Login Warden
      const wardenRes = await request(app)
        .post('/auth/login')
        .send({ email: 'warden.sharma@hostel.edu', password: 'WardenSecurePass!2026' });
      assert.equal(wardenRes.status, 200);
      wardenToken = wardenRes.body.data.accessToken;

      // Login Resident
      const resRes = await request(app)
        .post('/auth/login')
        .send({ email: 'aarav.patel@student.edu', password: 'ResidentAaravPass!2026' });
      assert.equal(resRes.status, 200);
      residentToken = resRes.body.data.accessToken;
    });

    it('POSITIVE TEST: Warden can trigger on-demand hostel curfew evaluation (POST /admin/curfew/evaluate)', async () => {
      const res = await request(app)
        .post('/admin/curfew/evaluate')
        .set('Authorization', `Bearer ${wardenToken}`)
        .send({
          hostelId: 'a0000000-0000-0000-0000-000000000001',
          date: '2026-09-29',
          timezone: '+05:30',
        });

      assert.equal(res.status, 200);
      assert.ok(res.body.data.summary);
      assert.ok(typeof res.body.data.summary.totalResidents === 'number');
      assert.ok(Array.isArray(res.body.data.results));
      assert.ok(res.body.data.results.length > 0);

      // Diya Sharma should be on APPROVED_LEAVE from seed
      const diya = res.body.data.results.find((r: any) => r.residentId === 'd0000000-0000-0000-0000-000000000002');
      assert.ok(diya);
      assert.equal(diya.status, 'APPROVED_LEAVE');
    });

    it('NEGATIVE TEST: Resident MUST BE FORBIDDEN (403) from triggering curfew evaluation', async () => {
      const res = await request(app)
        .post('/admin/curfew/evaluate')
        .set('Authorization', `Bearer ${residentToken}`)
        .send({
          hostelId: 'a0000000-0000-0000-0000-000000000001',
        });

      assert.equal(res.status, 403);
      assert.equal(res.body.error.code, 'ROLE_NOT_AUTHORIZED');
    });

    it('POSITIVE TEST: Warden can query persisted evaluation history (GET /admin/curfew/evaluation)', async () => {
      const res = await request(app)
        .get('/admin/curfew/evaluation?hostelId=a0000000-0000-0000-0000-000000000001&date=2026-09-29')
        .set('Authorization', `Bearer ${wardenToken}`);

      assert.equal(res.status, 200);
      assert.ok(Array.isArray(res.body.data));
      assert.ok(res.body.data.length > 0);
      res.body.data.forEach((r: any) => {
        assert.equal(r.hostelId, 'a0000000-0000-0000-0000-000000000001');
        assert.equal(r.curfewDate, '2026-09-29');
        assert.ok(r.status);
      });
    });
  });
});
