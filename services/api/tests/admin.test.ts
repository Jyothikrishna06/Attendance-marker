import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { InMemoryAuthRepository } from '../src/modules/auth/auth.repository.js';
import { InMemoryPresenceRepository } from '../src/modules/presence/presence.repository.js';
import { InMemoryAdminRepository } from '../src/modules/admin/admin.repository.js';
import { hashPassword } from '../src/core/crypto.js';

describe('Warden & Admin Dashboard Security & Workflow Suite', () => {
  let authRepo: InMemoryAuthRepository;
  let presenceRepo: InMemoryPresenceRepository;
  let adminRepo: InMemoryAdminRepository;
  let app: ReturnType<typeof createApp>;

  let wardenToken: string;
  let adminToken: string;
  let residentToken: string;

  const wardenCreds = {
    email: 'warden.sharma@hostel.edu',
    password: 'WardenSecurePass!2026',
  };

  const adminCreds = {
    email: 'admin@campus.edu',
    password: 'AdminSecurePass!2026',
  };

  const residentCreds = {
    email: 'aarav.patel@student.edu',
    password: 'ResidentAaravPass!2026',
  };

  before(async () => {
    authRepo = new InMemoryAuthRepository();
    presenceRepo = new InMemoryPresenceRepository();
    adminRepo = new InMemoryAdminRepository();

    const wardenHash = await hashPassword(wardenCreds.password);
    const adminHash = await hashPassword(adminCreds.password);
    const residentHash = await hashPassword(residentCreds.password);

    await authRepo.updateUserPasswordAndStatus(
      'c0000000-0000-0000-0000-000000000002',
      wardenHash,
      'ACTIVE'
    );
    await authRepo.updateUserPasswordAndStatus(
      'c0000000-0000-0000-0000-000000000001',
      adminHash,
      'ACTIVE'
    );
    await authRepo.updateUserPasswordAndStatus(
      'c0000000-0000-0000-0000-000000000003',
      residentHash,
      'ACTIVE'
    );

    app = createApp(authRepo, presenceRepo, undefined, adminRepo);

    // Login Warden
    const wardenRes = await request(app)
      .post('/auth/login')
      .send(wardenCreds);
    assert.equal(wardenRes.status, 200);
    wardenToken = wardenRes.body.data.accessToken;

    // Login Admin
    const adminRes = await request(app)
      .post('/auth/login')
      .send(adminCreds);
    assert.equal(adminRes.status, 200);
    adminToken = adminRes.body.data.accessToken;

    // Login Resident
    const resRes = await request(app)
      .post('/auth/login')
      .send(residentCreds);
    assert.equal(resRes.status, 200);
    residentToken = resRes.body.data.accessToken;
  });

  describe('1. Current Curfew Retrieval (GET /curfew/current)', () => {
    it('should allow both warden and resident to fetch current active curfew rule', async () => {
      // Resident query
      const resRes = await request(app)
        .get('/curfew/current')
        .set('Authorization', `Bearer ${residentToken}`);
      assert.equal(resRes.status, 200);
      assert.ok(resRes.body.data.ruleId);
      assert.ok(resRes.body.data.curfewTime);
      assert.ok(resRes.body.data.gracePeriodMinutes);
      assert.ok(resRes.body.data.curfewDeadline);

      // Warden query
      const wardenRes = await request(app)
        .get('/curfew/current')
        .set('Authorization', `Bearer ${wardenToken}`);
      assert.equal(wardenRes.status, 200);
      assert.equal(wardenRes.body.data.ruleId, resRes.body.data.ruleId);
    });

    it('should reject unauthenticated requests with 401 UNAUTHORIZED', async () => {
      const res = await request(app).get('/curfew/current');
      assert.equal(res.status, 401);
    });
  });

  describe('2. Curfew Management (POST /admin/curfew & PATCH /admin/curfew/:id)', () => {
    let createdRuleId: string;

    it('POSITIVE TEST: Warden can create a new curfew rule', async () => {
      const payload = {
        hostelId: 'a0000000-0000-0000-0000-000000000001',
        dayOfWeek: 5, // Friday
        curfewTime: '22:00:00',
        gracePeriodMinutes: 20,
        justification: 'Extended Friday curfew for weekend campus events',
      };

      const res = await request(app)
        .post('/admin/curfew')
        .set('Authorization', `Bearer ${wardenToken}`)
        .send(payload);

      assert.equal(res.status, 201);
      assert.equal(res.body.data.curfewTime, '22:00:00');
      assert.equal(res.body.data.gracePeriodMinutes, 20);
      assert.equal(res.body.data.dayOfWeek, 5);
      createdRuleId = res.body.data.id;
      assert.ok(createdRuleId);
    });

    it('NEGATIVE TEST: Resident MUST BE FORBIDDEN (403) from creating curfew rules', async () => {
      const res = await request(app)
        .post('/admin/curfew')
        .set('Authorization', `Bearer ${residentToken}`)
        .send({
          hostelId: 'a0000000-0000-0000-0000-000000000001',
          curfewTime: '23:00:00',
        });

      assert.equal(res.status, 403);
      assert.equal(res.body.error.code, 'ROLE_NOT_AUTHORIZED');
    });

    it('POSITIVE TEST: Admin can modify an existing curfew rule', async () => {
      const res = await request(app)
        .patch(`/admin/curfew/${createdRuleId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          curfewTime: '22:15:00',
          gracePeriodMinutes: 25,
          justification: 'Adjusted by student council request',
        });

      assert.equal(res.status, 200);
      assert.equal(res.body.data.curfewTime, '22:15:00');
      assert.equal(res.body.data.gracePeriodMinutes, 25);
    });

    it('NEGATIVE TEST: Resident MUST BE FORBIDDEN (403) from modifying curfew rules', async () => {
      const res = await request(app)
        .patch(`/admin/curfew/${createdRuleId}`)
        .set('Authorization', `Bearer ${residentToken}`)
        .send({ curfewTime: '23:59:00' });

      assert.equal(res.status, 403);
      assert.equal(res.body.error.code, 'ROLE_NOT_AUTHORIZED');
    });
  });

  describe('3. Curfew Status Roster & Filters (GET /admin/curfew/status)', () => {
    it('POSITIVE TEST: Warden can view live curfew status roster and summary counts', async () => {
      const res = await request(app)
        .get('/admin/curfew/status')
        .set('Authorization', `Bearer ${wardenToken}`);

      assert.equal(res.status, 200);
      assert.ok(res.body.data.summary);
      assert.ok(typeof res.body.data.summary.totalTracked === 'number');
      assert.ok(Array.isArray(res.body.data.roster));
      assert.ok(res.body.data.roster.length > 0);

      // Verify enriched resident fields
      const aarav = res.body.data.roster.find((r: any) => r.rollNumber === 'CS2026-001');
      assert.ok(aarav);
      assert.equal(aarav.name, 'Aarav Patel');
      assert.equal(aarav.roomNumber, '101');
      assert.equal(aarav.hostelCode, 'HOSTEL-A');
    });

    it('POSITIVE TEST: Warden can apply filters by hostel, floor, and status', async () => {
      // Filter by floor 1
      const floorRes = await request(app)
        .get('/admin/curfew/status?floor=1')
        .set('Authorization', `Bearer ${wardenToken}`);

      assert.equal(floorRes.status, 200);
      floorRes.body.data.roster.forEach((r: any) => {
        assert.equal(r.floor, 1);
      });

      // Filter by hostelCode
      const hostelRes = await request(app)
        .get('/admin/curfew/status?hostelId=HOSTEL-A')
        .set('Authorization', `Bearer ${wardenToken}`);

      assert.equal(hostelRes.status, 200);
      hostelRes.body.data.roster.forEach((r: any) => {
        assert.equal(r.hostelCode, 'HOSTEL-A');
      });
    });

    it('NEGATIVE TEST: Resident MUST BE FORBIDDEN (403) from accessing admin curfew status', async () => {
      const res = await request(app)
        .get('/admin/curfew/status')
        .set('Authorization', `Bearer ${residentToken}`);

      assert.equal(res.status, 403);
      assert.equal(res.body.error.code, 'ROLE_NOT_AUTHORIZED');
    });
  });

  describe('4. Leave Approval Queue (GET /admin/leave & PATCH /admin/leave/:id)', () => {
    it('POSITIVE TEST: Warden can retrieve leave requests with resident and room metadata', async () => {
      const res = await request(app)
        .get('/admin/leave')
        .set('Authorization', `Bearer ${wardenToken}`);

      assert.equal(res.status, 200);
      assert.ok(Array.isArray(res.body.data));
      assert.ok(res.body.data.length >= 2);

      const pendingLeave = res.body.data.find((l: any) => l.status === 'PENDING');
      assert.ok(pendingLeave);
      assert.ok(pendingLeave.residentName);
      assert.ok(pendingLeave.roomNumber);
    });

    it('POSITIVE TEST: Warden can approve pending leave with mandatory decision reason', async () => {
      const pendingLeaveId = '80000000-0000-0000-0000-000000000002'; // Aarav Patel
      const res = await request(app)
        .patch(`/admin/leave/${pendingLeaveId}`)
        .set('Authorization', `Bearer ${wardenToken}`)
        .send({
          status: 'APPROVED',
          decisionReason: 'Verified wedding invitation card and parent telephone confirmation',
        });

      assert.equal(res.status, 200);
      assert.equal(res.body.data.status, 'APPROVED');
      assert.equal(res.body.data.decisionReason, 'Verified wedding invitation card and parent telephone confirmation');
      assert.ok(res.body.data.approverId);
    });

    it('VALIDATION TEST: Reject leave decision if mandatory decisionReason is empty or missing', async () => {
      const leaveId = '80000000-0000-0000-0000-000000000001';
      const res = await request(app)
        .patch(`/admin/leave/${leaveId}`)
        .set('Authorization', `Bearer ${wardenToken}`)
        .send({
          status: 'REJECTED',
          decisionReason: '   ', // whitespace only
        });

      assert.equal(res.status, 400);
      assert.equal(res.body.error.code, 'VALIDATION_ERROR');
    });

    it('NEGATIVE TEST: Resident MUST BE FORBIDDEN (403) from adjudicating leave requests', async () => {
      const res = await request(app)
        .patch('/admin/leave/80000000-0000-0000-0000-000000000001')
        .set('Authorization', `Bearer ${residentToken}`)
        .send({
          status: 'APPROVED',
          decisionReason: 'Self-approval attempt',
        });

      assert.equal(res.status, 403);
      assert.equal(res.body.error.code, 'ROLE_NOT_AUTHORIZED');
    });
  });

  describe('5. Record Correction Functionality & Transactional Audit Commits', () => {
    it('POSITIVE TEST: Warden can correct a presence record and commit an immutable audit log', async () => {
      const residentId = 'd0000000-0000-0000-0000-000000000001'; // Aarav Patel
      const mandatoryReason = 'Warden physical floor inspection confirmed student was asleep in room 101 during curfew';

      const res = await request(app)
        .post('/admin/presence/correct')
        .set('Authorization', `Bearer ${wardenToken}`)
        .send({
          residentId,
          status: 'VERIFIED_INSIDE',
          reason: mandatoryReason,
        });

      assert.equal(res.status, 200);
      assert.equal(res.body.data.newStatus, 'VERIFIED_INSIDE');
      assert.equal(res.body.data.source, 'WARDEN_MANUAL');
      assert.equal(res.body.data.reason, mandatoryReason);
      assert.ok(res.body.data.auditLogId);

      // Verify that audit log was transactionally created
      const auditRes = await request(app)
        .get('/admin/audit?targetEntity=presence_events')
        .set('Authorization', `Bearer ${wardenToken}`);

      assert.equal(auditRes.status, 200);
      const correctionLog = auditRes.body.data.find(
        (l: any) => l.id === res.body.data.auditLogId
      );
      assert.ok(correctionLog, 'Audit log must exist in ledger');
      assert.equal(correctionLog.action, 'RECORD_CORRECTION');
      assert.equal(correctionLog.reason, mandatoryReason);
      assert.equal(correctionLog.actorRole, 'WARDEN');
    });

    it('VALIDATION TEST: Reject record correction if mandatory reason is empty or whitespace', async () => {
      const res = await request(app)
        .post('/admin/presence/correct')
        .set('Authorization', `Bearer ${wardenToken}`)
        .send({
          residentId: 'd0000000-0000-0000-0000-000000000001',
          status: 'VERIFIED_INSIDE',
          reason: '  ', // whitespace
        });

      assert.equal(res.status, 400);
      assert.equal(res.body.error.code, 'VALIDATION_ERROR');
    });

    it('NEGATIVE TEST: Resident MUST BE FORBIDDEN (403) from performing record corrections', async () => {
      const res = await request(app)
        .post('/admin/presence/correct')
        .set('Authorization', `Bearer ${residentToken}`)
        .send({
          residentId: 'd0000000-0000-0000-0000-000000000001',
          status: 'VERIFIED_INSIDE',
          reason: 'Student attempting self-correction',
        });

      assert.equal(res.status, 403);
      assert.equal(res.body.error.code, 'ROLE_NOT_AUTHORIZED');
    });
  });

  describe('6. Immutable Audit History (GET /admin/audit)', () => {
    it('POSITIVE TEST: Warden/Admin can query audit logs with pagination and filters', async () => {
      const res = await request(app)
        .get('/admin/audit?limit=10')
        .set('Authorization', `Bearer ${wardenToken}`);

      assert.equal(res.status, 200);
      assert.ok(Array.isArray(res.body.data));
      assert.ok(res.body.data.length > 0);
      res.body.data.forEach((log: any) => {
        assert.ok(log.id);
        assert.ok(log.action);
        assert.ok(log.reason);
        assert.ok(log.timestamp);
      });
    });

    it('NEGATIVE TEST: Resident MUST BE FORBIDDEN (403) from accessing audit logs', async () => {
      const res = await request(app)
        .get('/admin/audit')
        .set('Authorization', `Bearer ${residentToken}`);

      assert.equal(res.status, 403);
      assert.equal(res.body.error.code, 'ROLE_NOT_AUTHORIZED');
    });
  });
});
