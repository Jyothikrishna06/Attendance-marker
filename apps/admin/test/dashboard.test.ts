import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  ResidentStatusItem,
  CurrentCurfewPolicy,
} from '../src/types/index.js';

describe('Admin & Warden Frontend Dashboard Unit & E2E Logic Suite', () => {
  // Mock Roster Data
  const mockRoster: ResidentStatusItem[] = [
    {
      residentId: 'd0000000-0000-0000-0000-000000000001',
      userId: 'c0000000-0000-0000-0000-000000000003',
      name: 'Aarav Patel',
      email: 'aarav.patel@student.edu',
      rollNumber: 'CS2026-001',
      hostelId: 'a0000000-0000-0000-0000-000000000001',
      hostelName: 'Aryabhata Hall of Residence',
      hostelCode: 'HOSTEL-A',
      roomId: 'b0000000-0000-0000-0000-000000000101',
      roomNumber: '101',
      floor: 1,
      currentStatus: 'VERIFIED_INSIDE',
      lastEventType: 'ENTRY',
      lastSeen: '2026-09-29T20:45:00.000Z',
      activeDeviceId: 'e0000000-0000-0000-0000-000000000001',
      activeDeviceModel: 'Google Pixel 8',
      failureAlert: null,
      activeLeave: null,
      emergencyContact: { name: 'Suresh Patel', phone: '+919876543210' },
    },
    {
      residentId: 'd0000000-0000-0000-0000-000000000002',
      userId: 'c0000000-0000-0000-0000-000000000004',
      name: 'Diya Sharma',
      email: 'diya.sharma@student.edu',
      rollNumber: 'CS2026-002',
      hostelId: 'a0000000-0000-0000-0000-000000000001',
      hostelName: 'Aryabhata Hall of Residence',
      hostelCode: 'HOSTEL-A',
      roomId: 'b0000000-0000-0000-0000-000000000101',
      roomNumber: '101',
      floor: 1,
      currentStatus: 'APPROVED_LEAVE',
      lastEventType: null,
      lastSeen: null,
      activeDeviceId: 'e0000000-0000-0000-0000-000000000003',
      activeDeviceModel: 'Apple iPhone 15',
      failureAlert: null,
      activeLeave: {
        id: '80000000-0000-0000-0000-000000000001',
        leaveType: 'OUTPASS',
        endTime: '2026-09-29T23:00:00.000Z',
      },
      emergencyContact: { name: 'Sunita Sharma', phone: '+919876543211' },
    },
    {
      residentId: 'd0000000-0000-0000-0000-000000000003',
      userId: 'c0000000-0000-0000-0000-000000000005',
      name: 'Rohan Verma',
      email: 'rohan.verma@student.edu',
      rollNumber: 'CS2026-003',
      hostelId: 'a0000000-0000-0000-0000-000000000001',
      hostelName: 'Aryabhata Hall of Residence',
      hostelCode: 'HOSTEL-A',
      roomId: 'b0000000-0000-0000-0000-000000000102',
      roomNumber: '102',
      floor: 1,
      currentStatus: 'VERIFICATION_FAILED',
      lastEventType: null,
      lastSeen: null,
      activeDeviceId: null,
      activeDeviceModel: null,
      failureAlert: {
        attemptId: 'f0000000-0000-0000-0000-000000000099',
        failureReason: 'IP_NOT_IN_AUTHORIZED_SUBNET',
        timestamp: '2026-09-29T21:05:00.000Z',
      },
      activeLeave: null,
      emergencyContact: { name: 'Manoj Verma', phone: '+919876543212' },
    },
    {
      residentId: 'd0000000-0000-0000-0000-000000000004',
      userId: 'c0000000-0000-0000-0000-000000000006',
      name: 'Neha Gupta',
      email: 'neha.gupta@student.edu',
      rollNumber: 'CS2026-004',
      hostelId: 'a0000000-0000-0000-0000-000000000002',
      hostelName: 'Kalpana Chawla Hall of Residence',
      hostelCode: 'HOSTEL-K',
      roomId: 'b0000000-0000-0000-0000-000000000201',
      roomNumber: '201',
      floor: 2,
      currentStatus: 'PENDING_VERIFICATION',
      lastEventType: null,
      lastSeen: null,
      activeDeviceId: null,
      activeDeviceModel: null,
      failureAlert: null,
      activeLeave: null,
      emergencyContact: { name: 'R.K. Gupta', phone: '+919876543213' },
    },
  ];

  describe('1. Roster Filtering Engine Logic', () => {
    it('should filter correctly by hostel code', () => {
      const filteredA = mockRoster.filter((r) => r.hostelCode === 'HOSTEL-A');
      assert.equal(filteredA.length, 3);

      const filteredK = mockRoster.filter((r) => r.hostelCode === 'HOSTEL-K');
      assert.equal(filteredK.length, 1);
      assert.equal(filteredK[0].name, 'Neha Gupta');
    });

    it('should filter correctly by floor / block', () => {
      const floor1 = mockRoster.filter((r) => r.floor === 1);
      assert.equal(floor1.length, 3);

      const floor2 = mockRoster.filter((r) => r.floor === 2);
      assert.equal(floor2.length, 1);
      assert.equal(floor2[0].roomNumber, '201');
    });

    it('should filter correctly by presence status', () => {
      const inside = mockRoster.filter((r) => r.currentStatus === 'VERIFIED_INSIDE');
      assert.equal(inside.length, 1);
      assert.equal(inside[0].name, 'Aarav Patel');

      const onLeave = mockRoster.filter((r) => r.currentStatus === 'APPROVED_LEAVE');
      assert.equal(onLeave.length, 1);
      assert.equal(onLeave[0].name, 'Diya Sharma');

      const failed = mockRoster.filter((r) => r.currentStatus === 'VERIFICATION_FAILED');
      assert.equal(failed.length, 1);
      assert.equal(failed[0].name, 'Rohan Verma');
      assert.ok(failed[0].failureAlert);
    });

    it('should search residents by name, roll number, or room number', () => {
      const searchByName = (term: string) => {
        const t = term.toLowerCase();
        return mockRoster.filter(
          (r) =>
            r.name.toLowerCase().includes(t) ||
            r.rollNumber.toLowerCase().includes(t) ||
            r.roomNumber.toLowerCase().includes(t)
        );
      };

      assert.equal(searchByName('diya').length, 1);
      assert.equal(searchByName('CS2026-003').length, 1);
      assert.equal(searchByName('101').length, 2); // Aarav and Diya
    });
  });

  describe('2. Record Correction Validation Rules', () => {
    const validateCorrection = (reason: string): { valid: boolean; error?: string } => {
      if (!reason || !reason.trim()) {
        return {
          valid: false,
          error: 'A mandatory non-empty justification reason is required to correct attendance records.',
        };
      }
      return { valid: true };
    };

    it('should reject whitespace or empty justification reasons', () => {
      assert.equal(validateCorrection('').valid, false);
      assert.equal(validateCorrection('   ').valid, false);
      assert.ok(validateCorrection('').error);
    });

    it('should accept valid non-empty physical inspection rationale', () => {
      const res = validateCorrection(
        'Confirmed student physically present in room 101 during warden floor round'
      );
      assert.equal(res.valid, true);
      assert.equal(res.error, undefined);
    });
  });

  describe('3. Leave Adjudication Decision Validation Rules', () => {
    const validateLeaveAdjudication = (
      decisionReason: string,
      status: string
    ): { valid: boolean; error?: string } => {
      if (!['APPROVED', 'REJECTED'].includes(status)) {
        return { valid: false, error: 'Status must be APPROVED or REJECTED' };
      }
      if (!decisionReason || !decisionReason.trim()) {
        return {
          valid: false,
          error: 'A mandatory justification reason is required to render a leave decision.',
        };
      }
      return { valid: true };
    };

    it('should require non-empty justification for both approvals and rejections', () => {
      assert.equal(validateLeaveAdjudication('', 'APPROVED').valid, false);
      assert.equal(validateLeaveAdjudication('  \t\n', 'REJECTED').valid, false);
      assert.equal(
        validateLeaveAdjudication('Verified parent telephone authorization', 'APPROVED').valid,
        true
      );
      assert.equal(
        validateLeaveAdjudication('Exam scheduled on following morning', 'REJECTED').valid,
        true
      );
    });
  });

  describe('4. Curfew Policy Calculation & Deadline Logic', () => {
    it('should compute effective curfew deadline and grace deadline accurately', () => {
      const policy: CurrentCurfewPolicy = {
        ruleId: '70000000-0000-0000-0000-000000000001',
        hostelId: 'a0000000-0000-0000-0000-000000000001',
        hostelName: 'Aryabhata Hall',
        curfewTime: '21:30:00',
        gracePeriodMinutes: 15,
        curfewDeadline: '2026-09-29T16:00:00.000Z', // UTC representation of 21:30 IST (+5:30)
        graceDeadline: '2026-09-29T16:15:00.000Z',
        dayOfWeek: null,
        curfewDate: '2026-09-29',
      };

      const deadline = new Date(policy.curfewDeadline);
      const grace = new Date(policy.graceDeadline);
      const diffMinutes = (grace.getTime() - deadline.getTime()) / (60 * 1000);

      assert.equal(diffMinutes, 15);
      assert.equal(policy.gracePeriodMinutes, 15);
    });
  });

  describe('5. Staff RBAC Authorization Boundaries in UI', () => {
    const checkCanAdjudicate = (role: string) => {
      return role === 'WARDEN' || role === 'ADMIN' || role === 'SUPER_ADMIN';
    };

    const checkCanModifyCurfew = (role: string) => {
      return role === 'WARDEN' || role === 'ADMIN' || role === 'SUPER_ADMIN';
    };

    it('should grant warden and admin full operational privileges', () => {
      assert.equal(checkCanAdjudicate('WARDEN'), true);
      assert.equal(checkCanAdjudicate('ADMIN'), true);
      assert.equal(checkCanAdjudicate('SUPER_ADMIN'), true);
      assert.equal(checkCanModifyCurfew('WARDEN'), true);
      assert.equal(checkCanModifyCurfew('ADMIN'), true);
    });

    it('should forbid resident accounts from staff operations in UI', () => {
      assert.equal(checkCanAdjudicate('RESIDENT'), false);
      assert.equal(checkCanModifyCurfew('RESIDENT'), false);
    });
  });
});
