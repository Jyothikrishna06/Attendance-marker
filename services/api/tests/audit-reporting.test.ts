import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { InMemoryAuthRepository } from '../src/modules/auth/auth.repository.js';
import { InMemoryPresenceRepository } from '../src/modules/presence/presence.repository.js';
import { InMemoryAdminRepository } from '../src/modules/admin/admin.repository.js';
import { InMemoryCurfewEvaluationRepository } from '../src/modules/curfew-evaluation/curfew-evaluation.repository.js';
import { InMemoryAuditRepository, AuditLogImmutableError } from '../src/modules/audit/index.js';
import { signAccessToken } from '../src/core/jwt.js';

describe('Immutable Audit Logging & Executive Reporting Test Suite', () => {
  let app: any;
  let authRepo: InMemoryAuthRepository;
  let presenceRepo: InMemoryPresenceRepository;
  let adminRepo: InMemoryAdminRepository;
  let curfewEvalRepo: InMemoryCurfewEvaluationRepository;
  let auditRepo: InMemoryAuditRepository;

  let superAdminToken: string;
  let wardenToken: string;
  let residentToken: string;

  beforeEach(() => {
    auditRepo = new InMemoryAuditRepository();
    authRepo = new InMemoryAuthRepository();
    presenceRepo = new InMemoryPresenceRepository();
    adminRepo = new InMemoryAdminRepository(auditRepo);
    curfewEvalRepo = new InMemoryCurfewEvaluationRepository();

    app = createApp(authRepo, presenceRepo, undefined, adminRepo, curfewEvalRepo, auditRepo);

    superAdminToken = signAccessToken({
      userId: 'c0000000-0000-0000-0000-000000000001',
      email: 'admin@campus.edu',
      role: 'SUPER_ADMIN',
      status: 'ACTIVE',
    });

    wardenToken = signAccessToken({
      userId: 'c0000000-0000-0000-0000-000000000002',
      email: 'warden.sharma@hostel.edu',
      role: 'WARDEN',
      status: 'ACTIVE',
    });

    residentToken = signAccessToken({
      userId: 'c0000000-0000-0000-0000-000000000003',
      email: 'aarav.patel@student.edu',
      role: 'RESIDENT',
      status: 'ACTIVE',
      residentId: 'd0000000-0000-0000-0000-000000000001',
    });
  });

  // ============================================================================
  // 1. Audit Immutability & Database Constraints
  // ============================================================================
  describe('1. Audit Ledger Immutability & Constraint Enforcement', () => {
    it('should reject creating an audit log with an empty or whitespace justification reason', async () => {
      await assert.rejects(
        async () => {
          await auditRepo.createAuditLog({
            actorId: 'c0000000-0000-0000-0000-000000000001',
            actorRole: 'SUPER_ADMIN',
            action: 'RECORD_CORRECTION',
            targetEntity: 'presence_events',
            targetId: 'evt-123',
            reason: '   ',
          });
        },
        /Mandatory non-empty reason/i
      );
    });

    it('IMMUTABILITY GUARANTEE: updateAuditLog MUST strictly throw AuditLogImmutableError', () => {
      assert.throws(
        () => {
          auditRepo.updateAuditLog('90000000-0000-0000-0000-000000000001', {
            reason: 'Tampered reason string',
          });
        },
        (err: any) => {
          return (
            err instanceof AuditLogImmutableError &&
            err.code === 'AUDIT_LOG_IMMUTABLE' &&
            err.statusCode === 403
          );
        }
      );
    });

    it('IMMUTABILITY GUARANTEE: deleteAuditLog MUST strictly throw AuditLogImmutableError', () => {
      assert.throws(
        () => {
          auditRepo.deleteAuditLog('90000000-0000-0000-0000-000000000001');
        },
        (err: any) => {
          return (
            err instanceof AuditLogImmutableError &&
            err.code === 'AUDIT_LOG_IMMUTABLE' &&
            err.statusCode === 403
          );
        }
      );
    });

    it('IMMUTABILITY GUARANTEE: Modifying returned query logs does not alter internal repository records', async () => {
      const logs = await auditRepo.getAuditLogs();
      assert.ok(logs.length > 0);
      const originalReason = logs[0].reason;

      // Attempt in-memory mutation
      (logs[0] as any).reason = 'Mutated by malicious caller';

      const refetched = await auditRepo.getAuditLogs();
      assert.equal(refetched[0].reason, originalReason, 'Internal audit ledger must be tamper-proof');
    });
  });

  // ============================================================================
  // 2. Comprehensive Audit Event Recording
  // ============================================================================
  describe('2. Comprehensive Audit Event Recording Coverage', () => {
    it('should record audit log when resident activates account (ACCOUNT_ACTIVATED)', async () => {
      const res = await request(app)
        .post('/auth/activate')
        .send({
          email: 'rohan.verma@student.edu',
          activationToken: 'ACTIVATE_ROHAN_2026_TOKEN',
          newPassword: 'RohanNewSecurePassword!2026',
        });

      assert.equal(res.status, 200);

      // Verify audit log
      const logs = await auditRepo.getAuditLogs({ targetEntity: 'users', action: 'ACCOUNT_ACTIVATED' });
      assert.equal(logs.length, 1);
      const log = logs[0];
      assert.equal(log.actorRole, 'RESIDENT');
      assert.equal(log.targetId, 'c0000000-0000-0000-0000-000000000005');
      assert.deepEqual(log.previousState, { status: 'PENDING_ACTIVATION' });
      assert.deepEqual(log.newState, { status: 'ACTIVE' });
      assert.ok(log.reason.length > 0);
      assert.ok(log.timestamp);
    });

    it('should record audit log when resident binds a hardware device (DEVICE_REGISTERED)', async () => {
      // Rohan Verma is now active, let's login and bind device
      await request(app)
        .post('/auth/activate')
        .send({
          email: 'rohan.verma@student.edu',
          activationToken: 'ACTIVATE_ROHAN_2026_TOKEN',
          newPassword: 'RohanNewSecurePassword!2026',
        });

      const loginRes = await request(app)
        .post('/auth/login')
        .send({
          email: 'rohan.verma@student.edu',
          password: 'RohanNewSecurePassword!2026',
        });

      const rohanToken = loginRes.body.data.accessToken;

      const devRes = await request(app)
        .post('/auth/device/register')
        .set('Authorization', `Bearer ${rohanToken}`)
        .send({
          deviceIdentifier: 'DEV-FINGERPRINT-ROHAN-12345',
          deviceModel: 'Samsung Galaxy S24 Ultra',
          osName: 'ANDROID',
          osVersion: '14.0',
        });

      assert.equal(devRes.status, 201);

      // Verify audit log
      const logs = await auditRepo.getAuditLogs({ targetEntity: 'devices', action: 'DEVICE_REGISTERED' });
      assert.equal(logs.length, 1);
      const log = logs[0];
      assert.equal(log.actorRole, 'RESIDENT');
      assert.equal(log.targetId, devRes.body.data.device.id);
      assert.equal(log.previousState, null);
      assert.equal(log.newState?.deviceIdentifier, 'DEV-FINGERPRINT-ROHAN-12345');
      assert.ok(log.reason);
    });

    it('should record audit log when admin changes user account status (USER_STATUS_UPDATED / ACCOUNT_DEACTIVATED)', async () => {
      const res = await request(app)
        .patch('/admin/users/c0000000-0000-0000-0000-000000000003/status')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({
          status: 'DEACTIVATED',
          reason: 'Student graduated and vacated hostel room 101',
        });

      assert.equal(res.status, 200);

      // Verify audit log
      const logs = await auditRepo.getAuditLogs({ targetEntity: 'users', action: 'ACCOUNT_DEACTIVATED' });
      assert.equal(logs.length, 1);
      const log = logs[0];
      assert.equal(log.actorId, 'c0000000-0000-0000-0000-000000000001');
      assert.equal(log.actorRole, 'SUPER_ADMIN');
      assert.equal(log.targetId, 'c0000000-0000-0000-0000-000000000003');
      assert.deepEqual(log.previousState, { status: 'ACTIVE' });
      assert.deepEqual(log.newState, { status: 'DEACTIVATED' });
      assert.equal(log.reason, 'Student graduated and vacated hostel room 101');
    });

    it('should record audit log when warden revokes a registered device (DEVICE_REVOKED)', async () => {
      // Find active device for Aarav
      const activeDev = await authRepo.findActiveDeviceByResidentId('d0000000-0000-0000-0000-000000000001');
      assert.ok(activeDev, 'Aarav must have seeded active device');

      const res = await request(app)
        .post(`/admin/devices/${activeDev.id}/revoke`)
        .set('Authorization', `Bearer ${wardenToken}`)
        .send({
          reason: 'Student reported mobile phone lost on campus grounds',
        });

      assert.equal(res.status, 200);

      // Verify audit log
      const logs = await auditRepo.getAuditLogs({ targetEntity: 'devices', action: 'DEVICE_REVOKED' });
      assert.equal(logs.length, 1);
      const log = logs[0];
      assert.equal(log.actorId, 'c0000000-0000-0000-0000-000000000002');
      assert.equal(log.actorRole, 'WARDEN');
      assert.equal(log.targetId, activeDev.id);
      assert.equal(log.previousState?.status, 'ACTIVE');
      assert.equal(log.newState?.status, 'REVOKED');
      assert.equal(log.reason, 'Student reported mobile phone lost on campus grounds');
    });

    it('should record audit log on attendance record correction (RECORD_CORRECTION)', async () => {
      const res = await request(app)
        .post('/admin/presence/correct')
        .set('Authorization', `Bearer ${wardenToken}`)
        .send({
          residentId: 'd0000000-0000-0000-0000-000000000001',
          status: 'VERIFIED_INSIDE',
          reason: 'Physically inspected student present at hostel reception desk',
        });

      assert.equal(res.status, 200);

      const logs = await auditRepo.getAuditLogs({ targetEntity: 'presence_events', action: 'RECORD_CORRECTION' });
      assert.equal(logs.length, 1);
      const log = logs[0];
      assert.equal(log.actorRole, 'WARDEN');
      assert.equal(log.reason, 'Physically inspected student present at hostel reception desk');
      assert.equal(log.newState?.status, 'VERIFIED_INSIDE');
    });

    it('should record audit log on leave status decision (LEAVE_STATUS_UPDATED)', async () => {
      const res = await request(app)
        .patch('/admin/leave/80000000-0000-0000-0000-000000000002')
        .set('Authorization', `Bearer ${wardenToken}`)
        .send({
          status: 'APPROVED',
          decisionReason: 'Parent telephonically confirmed weekend home visit permission',
        });

      assert.equal(res.status, 200);

      const logs = await auditRepo.getAuditLogs({ targetEntity: 'leave_requests', action: 'LEAVE_STATUS_UPDATED' });
      assert.equal(logs.length, 1);
      const log = logs[0];
      assert.equal(log.actorRole, 'WARDEN');
      assert.equal(log.reason, 'Parent telephonically confirmed weekend home visit permission');
      assert.equal(log.newState?.status, 'APPROVED');
    });

    it('should record audit log on curfew policy creation (CURFEW_RULE_CREATED)', async () => {
      const res = await request(app)
        .post('/admin/curfew')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({
          hostelId: 'a0000000-0000-0000-0000-000000000002',
          curfewTime: '22:00:00',
          gracePeriodMinutes: 20,
          justification: 'Semester exams extended study hours curfew rule',
        });

      assert.equal(res.status, 201);

      const logs = await auditRepo.getAuditLogs({
        targetEntity: 'curfew_rules',
        action: 'CURFEW_RULE_CREATED',
      });
      // 1 seeded + 1 created = 2
      assert.equal(logs.length, 2);
      const log = logs[0];
      assert.equal(log.actorRole, 'SUPER_ADMIN');
      assert.equal(log.reason, 'Semester exams extended study hours curfew rule');
    });
  });

  // ============================================================================
  // 3. Daily Attendance / Presence Report
  // ============================================================================
  describe('3. Daily Attendance & Presence Report (GET /admin/reports/daily-attendance)', () => {
    it('POSITIVE TEST: Warden can retrieve daily attendance report in JSON format', async () => {
      const res = await request(app)
        .get('/admin/reports/daily-attendance')
        .set('Authorization', `Bearer ${wardenToken}`);

      assert.equal(res.status, 200);
      assert.equal(res.body.status, 'success');
      assert.ok(res.body.data.summary);
      assert.ok(typeof res.body.data.summary.totalResidents === 'number');
      assert.ok(Array.isArray(res.body.data.records));

      const firstRecord = res.body.data.records[0];
      assert.ok(firstRecord.residentName);
      assert.ok(firstRecord.rollNumber);
      assert.ok(firstRecord.hostelName);
      assert.ok(firstRecord.curfewStatus);
    });

    it('POSITIVE TEST: Warden can filter daily attendance report by hostelId', async () => {
      const res = await request(app)
        .get('/admin/reports/daily-attendance?hostelId=a0000000-0000-0000-0000-000000000001')
        .set('Authorization', `Bearer ${wardenToken}`);

      assert.equal(res.status, 200);
      assert.equal(res.body.data.hostelName, 'Aryabhata Hall of Residence');
      for (const rec of res.body.data.records) {
        assert.equal(rec.hostelId, 'a0000000-0000-0000-0000-000000000001');
      }
    });

    it('CSV EXPORT: Warden can export daily attendance report as RFC-4180 CSV via ?format=csv', async () => {
      const res = await request(app)
        .get('/admin/reports/daily-attendance?format=csv')
        .set('Authorization', `Bearer ${wardenToken}`);

      assert.equal(res.status, 200);
      assert.equal(res.headers['content-type'], 'text/csv; charset=utf-8');
      assert.match(res.headers['content-disposition'], /attachment; filename="daily-attendance-/);

      const csvText = res.text;
      const lines = csvText.split('\r\n');
      assert.ok(lines.length >= 2, 'Must contain header and at least one data row');

      // Verify header columns
      const headers = lines[0].split(',');
      assert.ok(headers.includes('Roll Number'));
      assert.ok(headers.includes('Resident Name'));
      assert.ok(headers.includes('Curfew Status'));
      assert.ok(headers.includes('Check-In Time'));
    });

    it('CSV EXPORT: Warden can export daily attendance report via Accept: text/csv header negotiation', async () => {
      const res = await request(app)
        .get('/admin/reports/daily-attendance')
        .set('Authorization', `Bearer ${wardenToken}`)
        .set('Accept', 'text/csv');

      assert.equal(res.status, 200);
      assert.equal(res.headers['content-type'], 'text/csv; charset=utf-8');
      assert.ok(res.text.includes('Roll Number'));
    });
  });

  // ============================================================================
  // 4. Late Return Report
  // ============================================================================
  describe('4. Late Return Infractions Report (GET /admin/reports/late-returns)', () => {
    it('POSITIVE TEST: Warden can retrieve late return reports with metrics', async () => {
      // Seed a late return evaluation
      await curfewEvalRepo.saveEvaluationResults('a0000000-0000-0000-0000-000000000001', [
        {
          residentId: 'd0000000-0000-0000-0000-000000000001',
          curfewDate: '2026-09-29',
          status: 'NOT_VERIFIED',
          statusReason: 'Late return: Resident checked in 25 minute(s) past grace deadline',
          curfewDeadline: new Date('2026-09-29T21:30:00+05:30'),
          graceDeadline: new Date('2026-09-29T21:45:00+05:30'),
          isLateReturn: true,
          lateMinutes: 25,
          evaluatedAt: new Date('2026-09-29T22:10:00+05:30'),
          resolvedLeaveId: null,
          resolvedEventId: null,
        },
      ]);

      const res = await request(app)
        .get('/admin/reports/late-returns?date=2026-09-29')
        .set('Authorization', `Bearer ${wardenToken}`);

      assert.equal(res.status, 200);
      assert.equal(res.body.data.summary.totalLateReturns, 1);
      assert.equal(res.body.data.summary.maxLateMinutes, 25);
      assert.equal(res.body.data.summary.averageLateMinutes, 25);
      assert.equal(res.body.data.records[0].rollNumber, 'CS2026-001');
      assert.equal(res.body.data.records[0].lateMinutes, 25);
    });

    it('CSV EXPORT: Warden can export late return report as CSV', async () => {
      await curfewEvalRepo.saveEvaluationResults('a0000000-0000-0000-0000-000000000001', [
        {
          residentId: 'd0000000-0000-0000-0000-000000000001',
          curfewDate: '2026-09-29',
          status: 'NOT_VERIFIED',
          statusReason: 'Late return',
          curfewDeadline: new Date('2026-09-29T21:30:00+05:30'),
          graceDeadline: new Date('2026-09-29T21:45:00+05:30'),
          isLateReturn: true,
          lateMinutes: 18,
          evaluatedAt: new Date(),
          resolvedLeaveId: null,
          resolvedEventId: null,
        },
      ]);

      const res = await request(app)
        .get('/admin/reports/late-returns?date=2026-09-29&format=csv')
        .set('Authorization', `Bearer ${wardenToken}`);

      assert.equal(res.status, 200);
      assert.equal(res.headers['content-type'], 'text/csv; charset=utf-8');
      assert.match(res.headers['content-disposition'], /attachment; filename="late-returns-/);
      assert.ok(res.text.includes('Late Minutes'));
      assert.ok(res.text.includes('18'));
    });
  });

  // ============================================================================
  // 5. Leave Report
  // ============================================================================
  describe('5. Leave & Outpass Report (GET /admin/reports/leaves)', () => {
    it('POSITIVE TEST: Warden can retrieve leave requests with resident and approver details', async () => {
      const res = await request(app)
        .get('/admin/reports/leaves')
        .set('Authorization', `Bearer ${wardenToken}`);

      assert.equal(res.status, 200);
      assert.ok(res.body.data.summary.totalLeaves >= 2);
      assert.ok(res.body.data.records.some((l: any) => l.status === 'APPROVED'));
      assert.ok(res.body.data.records.some((l: any) => l.leaveType === 'OUTPASS'));
    });

    it('POSITIVE TEST: Warden can filter leave report by status', async () => {
      const res = await request(app)
        .get('/admin/reports/leaves?status=APPROVED')
        .set('Authorization', `Bearer ${wardenToken}`);

      assert.equal(res.status, 200);
      for (const leave of res.body.data.records) {
        assert.equal(leave.status, 'APPROVED');
      }
    });

    it('CSV EXPORT: Warden can export leave report as CSV', async () => {
      const res = await request(app)
        .get('/admin/reports/leaves?format=csv')
        .set('Authorization', `Bearer ${wardenToken}`);

      assert.equal(res.status, 200);
      assert.equal(res.headers['content-type'], 'text/csv; charset=utf-8');
      assert.ok(res.text.includes('Leave ID,Resident Name,Roll Number'));
      assert.ok(res.text.includes('OUTPASS'));
    });
  });

  // ============================================================================
  // 6. Verification Failures Report
  // ============================================================================
  describe('6. Verification Failure Report (GET /admin/reports/verification-failures)', () => {
    it('POSITIVE TEST: Warden can retrieve verification failure report with failure taxonomy', async () => {
      // Seed a failed verification attempt
      const attempt = await presenceRepo.createVerificationAttempt({
        residentId: 'd0000000-0000-0000-0000-000000000001',
        deviceId: 'DEV-FINGERPRINT-AARAV-PHONE',
        sessionNonceHash: 'dummy_hash_fail',
        challengeIssuedAt: new Date(),
        challengeExpiresAt: new Date(Date.now() + 60000),
        clientMetadata: { ip: '198.51.100.45', deviceModel: 'Pixel 8' },
      });

      await presenceRepo.updateVerificationAttempt(attempt.id, {
        status: 'REJECTED',
        failureReason: 'IP_NOT_IN_AUTHORIZED_SUBNET',
      });

      const res = await request(app)
        .get('/admin/reports/verification-failures')
        .set('Authorization', `Bearer ${wardenToken}`);

      assert.equal(res.status, 200);
      assert.ok(res.body.data.summary.rejectedCount >= 1);
      assert.ok(res.body.data.summary.networkRejectedCount >= 1);
      assert.ok(res.body.data.records.some((r: any) => r.failureReason === 'IP_NOT_IN_AUTHORIZED_SUBNET'));
    });

    it('CSV EXPORT: Warden can export verification failure report as CSV', async () => {
      const res = await request(app)
        .get('/admin/reports/verification-failures?format=csv')
        .set('Authorization', `Bearer ${wardenToken}`);

      assert.equal(res.status, 200);
      assert.equal(res.headers['content-type'], 'text/csv; charset=utf-8');
      assert.ok(res.text.includes('Attempt ID,Timestamp,Hostel,Roll Number'));
    });
  });

  // ============================================================================
  // 7. Audit Log Export & Reporting
  // ============================================================================
  describe('7. Executive Audit Log Export (GET /admin/reports/audit)', () => {
    it('CSV EXPORT: Admin can export full immutable audit ledger as CSV', async () => {
      const res = await request(app)
        .get('/admin/reports/audit?format=csv')
        .set('Authorization', `Bearer ${superAdminToken}`);

      assert.equal(res.status, 200);
      assert.equal(res.headers['content-type'], 'text/csv; charset=utf-8');
      assert.match(res.headers['content-disposition'], /attachment; filename="audit-log-export.csv"/);
      assert.ok(res.text.includes('Audit ID,Timestamp,Actor ID,Actor Role,Action,Target Entity'));
      assert.ok(res.text.includes('SUPER_ADMIN'));
      assert.ok(res.text.includes('CURFEW_RULE_CREATED'));
    });
  });

  // ============================================================================
  // 8. Role-Based Access Control (RBAC) Protection
  // ============================================================================
  describe('8. Staff RBAC Protection on Reporting & User Administration Endpoints', () => {
    it('NEGATIVE TEST: Resident MUST BE FORBIDDEN (403) from accessing daily attendance reports', async () => {
      const res = await request(app)
        .get('/admin/reports/daily-attendance')
        .set('Authorization', `Bearer ${residentToken}`);

      assert.equal(res.status, 403);
    });

    it('NEGATIVE TEST: Resident MUST BE FORBIDDEN (403) from accessing late return reports', async () => {
      const res = await request(app)
        .get('/admin/reports/late-returns')
        .set('Authorization', `Bearer ${residentToken}`);

      assert.equal(res.status, 403);
    });

    it('NEGATIVE TEST: Resident MUST BE FORBIDDEN (403) from accessing leave reports', async () => {
      const res = await request(app)
        .get('/admin/reports/leaves')
        .set('Authorization', `Bearer ${residentToken}`);

      assert.equal(res.status, 403);
    });

    it('NEGATIVE TEST: Resident MUST BE FORBIDDEN (403) from accessing verification failure reports', async () => {
      const res = await request(app)
        .get('/admin/reports/verification-failures')
        .set('Authorization', `Bearer ${residentToken}`);

      assert.equal(res.status, 403);
    });

    it('NEGATIVE TEST: Resident MUST BE FORBIDDEN (403) from accessing executive audit export', async () => {
      const res = await request(app)
        .get('/admin/reports/audit')
        .set('Authorization', `Bearer ${residentToken}`);

      assert.equal(res.status, 403);
    });

    it('NEGATIVE TEST: Resident MUST BE FORBIDDEN (403) from updating user account status', async () => {
      const res = await request(app)
        .patch('/admin/users/c0000000-0000-0000-0000-000000000003/status')
        .set('Authorization', `Bearer ${residentToken}`)
        .send({
          status: 'SUSPENDED',
          reason: 'Unauthorized attempt',
        });

      assert.equal(res.status, 403);
    });

    it('NEGATIVE TEST: Resident MUST BE FORBIDDEN (403) from revoking devices via admin endpoint', async () => {
      const res = await request(app)
        .post('/admin/devices/some-dev-id/revoke')
        .set('Authorization', `Bearer ${residentToken}`)
        .send({
          reason: 'Unauthorized attempt',
        });

      assert.equal(res.status, 403);
    });
  });
});
