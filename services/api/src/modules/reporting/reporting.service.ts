import { IAdminRepository } from '../admin/admin.repository.js';
import { IAuthRepository } from '../auth/auth.repository.js';
import { IPresenceRepository } from '../presence/presence.repository.js';
import { ICurfewEvaluationRepository } from '../curfew-evaluation/curfew-evaluation.repository.js';
import { IAuditRepository } from '../audit/audit.repository.js';
import {
  DailyAttendanceReport,
  DailyAttendanceReportItem,
  DailyAttendanceFilter,
  LateReturnReport,
  LateReturnReportItem,
  LateReturnFilter,
  LeaveReport,
  LeaveReportItem,
  LeaveReportFilter,
  VerificationFailureReport,
  VerificationFailureReportItem,
  VerificationFailureFilter,
} from './reporting.types.js';
import { AuditLogFilter } from '../audit/audit.types.js';
import { AuditLog, CurfewEvaluationStatus } from '../../common/types.js';
import { buildCsv } from './csv.utils.js';

export class ReportingService {
  constructor(
    private adminRepo: IAdminRepository,
    private authRepo: IAuthRepository,
    private presenceRepo: IPresenceRepository,
    private curfewEvalRepo: ICurfewEvaluationRepository,
    private auditRepo: IAuditRepository
  ) {}

  /**
   * 1. Daily Attendance / Presence Report
   */
  async getDailyAttendanceReport(filter: DailyAttendanceFilter = {}): Promise<DailyAttendanceReport> {
    const curfewDate = filter.date || new Date().toISOString().split('T')[0];
    const hostels = await this.adminRepo.getHostels();
    const rooms = await this.adminRepo.getRooms();
    const residents = await this.authRepo.getAllResidents();
    const users = await this.authRepo.getAllUsers();
    const presenceEvents = await this.presenceRepo.getAllPresenceEvents();
    const evaluations = await this.curfewEvalRepo.getAllEvaluations();

    const roomMap = new Map(rooms.map((r) => [r.id, r]));
    const userMap = new Map(users.map((u) => [u.id, u]));
    const hostelMap = new Map(hostels.map((h) => [h.id, h]));

    let targetHostelName = 'All Hostels';
    if (filter.hostelId) {
      const h = hostelMap.get(filter.hostelId);
      if (h) targetHostelName = h.name;
    }

    // Filter target residents
    const filteredResidents = residents.filter((r) => {
      if (filter.hostelId && r.hostelId !== filter.hostelId) return false;
      return true;
    });

    const items: DailyAttendanceReportItem[] = [];

    for (const resident of filteredResidents) {
      const user = userMap.get(resident.userId);
      const room = roomMap.get(resident.roomId);
      const hostel = hostelMap.get(resident.hostelId);

      // Check persisted curfew evaluation for this date
      const evalRecord = evaluations.find(
        (e) => e.residentId === resident.id && e.curfewDate === curfewDate
      );

      // Find presence events for this resident on this curfew date
      const residentEvents = presenceEvents.filter(
        (e) => e.residentId === resident.id && e.curfewDate === curfewDate
      );
      const latestEntry = [...residentEvents]
        .filter((e) => e.eventType === 'ENTRY')
        .sort((a, b) => new Date(b.serverTimestamp).getTime() - new Date(a.serverTimestamp).getTime())[0];

      // Derive status
      let status: CurfewEvaluationStatus = 'PENDING_VERIFICATION';
      let statusReason = 'Awaiting curfew check-in';
      let curfewDeadlineStr = `${curfewDate}T21:30:00.000Z`;
      let graceDeadlineStr = `${curfewDate}T21:45:00.000Z`;
      let isLate = false;
      let lateMins: number | null = null;
      let checkInTimeStr: string | null = null;
      let verificationMethod = 'NONE';

      if (evalRecord) {
        status = evalRecord.status;
        statusReason = evalRecord.statusReason;
        curfewDeadlineStr = new Date(evalRecord.curfewDeadline).toISOString();
        graceDeadlineStr = new Date(evalRecord.graceDeadline).toISOString();
        isLate = evalRecord.isLateReturn;
        lateMins = evalRecord.lateMinutes || null;
      }

      if (latestEntry) {
        checkInTimeStr = new Date(latestEntry.serverTimestamp).toISOString();
        verificationMethod =
          latestEntry.source === 'VERIFICATION_SESSION'
            ? 'MOBILE_BIOMETRIC'
            : latestEntry.source === 'WARDEN_MANUAL'
            ? 'WARDEN_MANUAL'
            : latestEntry.source === 'ADMIN_OVERRIDE'
            ? 'ADMIN_OVERRIDE'
            : 'MOBILE_CHECKIN';

        if (!evalRecord) {
          if (latestEntry.status === 'VERIFIED_INSIDE') {
            status = 'VERIFIED_INSIDE';
            statusReason = 'Verified inside hostel via mobile application';
          } else if (latestEntry.status === 'FLAGGED') {
            status = 'VERIFICATION_FAILED';
            statusReason = 'Presence event flagged by system';
          }
        }
      }

      // Check leave
      const activeLeave = await this.adminRepo.findActiveLeaveForResident(
        resident.id,
        new Date(`${curfewDate}T21:30:00+05:30`)
      );
      const leaveType = activeLeave ? activeLeave.leaveType : null;
      if (activeLeave && status !== 'VERIFIED_INSIDE' && !evalRecord) {
        status = 'APPROVED_LEAVE';
        statusReason = `On approved ${activeLeave.leaveType} leave`;
      }

      const item: DailyAttendanceReportItem = {
        residentId: resident.id,
        rollNumber: resident.rollNumber,
        residentName: user?.name || 'Resident',
        hostelId: resident.hostelId,
        hostelName: hostel?.name || 'Hostel',
        hostelCode: hostel?.code || 'HST',
        roomNumber: room?.roomNumber || 'N/A',
        floor: room?.floor ?? 0,
        curfewDate,
        curfewStatus: status,
        statusReason,
        curfewDeadline: curfewDeadlineStr,
        graceDeadline: graceDeadlineStr,
        checkInTime: checkInTimeStr,
        verificationMethod,
        isLateReturn: isLate,
        lateMinutes: lateMins,
        leaveType,
      };

      if (!filter.status || filter.status.toUpperCase() === status) {
        items.push(item);
      }
    }

    const verifiedInside = items.filter((i) => i.curfewStatus === 'VERIFIED_INSIDE').length;
    const approvedLeave = items.filter((i) => i.curfewStatus === 'APPROVED_LEAVE').length;
    const pendingVerification = items.filter((i) => i.curfewStatus === 'PENDING_VERIFICATION').length;
    const notVerified = items.filter((i) => i.curfewStatus === 'NOT_VERIFIED').length;
    const verificationFailed = items.filter((i) => i.curfewStatus === 'VERIFICATION_FAILED').length;
    const totalResidents = items.length;

    const attendanceRatePercentage =
      totalResidents > 0
        ? Number((((verifiedInside + approvedLeave) / totalResidents) * 100).toFixed(1))
        : 0;

    return {
      reportName: 'Daily Attendance & Curfew Presence Report',
      curfewDate,
      hostelId: filter.hostelId || null,
      hostelName: targetHostelName,
      generatedAt: new Date().toISOString(),
      summary: {
        totalResidents,
        verifiedInside,
        approvedLeave,
        pendingVerification,
        notVerified,
        verificationFailed,
        attendanceRatePercentage,
      },
      records: items,
    };
  }

  exportDailyAttendanceCsv(report: DailyAttendanceReport): string {
    const headers = [
      'Date',
      'Hostel Code',
      'Hostel Name',
      'Roll Number',
      'Resident Name',
      'Room',
      'Curfew Status',
      'Curfew Deadline',
      'Grace Deadline',
      'Check-In Time',
      'Verification Method',
      'Late Return',
      'Late Minutes',
      'Leave Type',
      'Status Reason',
    ];

    const rows = report.records.map((r) => [
      r.curfewDate,
      r.hostelCode,
      r.hostelName,
      r.rollNumber,
      r.residentName,
      r.roomNumber,
      r.curfewStatus,
      r.curfewDeadline,
      r.graceDeadline,
      r.checkInTime || '',
      r.verificationMethod,
      r.isLateReturn ? 'YES' : 'NO',
      r.lateMinutes ?? '',
      r.leaveType || '',
      r.statusReason,
    ]);

    return buildCsv(headers, rows);
  }

  /**
   * 2. Late Return Reports
   */
  async getLateReturnReport(filter: LateReturnFilter = {}): Promise<LateReturnReport> {
    const targetDate = filter.date || new Date().toISOString().split('T')[0];
    const startDate = filter.startDate || targetDate;
    const endDate = filter.endDate || targetDate;

    const evaluations = await this.curfewEvalRepo.getAllEvaluations();
    const residents = await this.authRepo.getAllResidents();
    const users = await this.authRepo.getAllUsers();
    const hostels = await this.adminRepo.getHostels();
    const rooms = await this.adminRepo.getRooms();
    const presenceEvents = await this.presenceRepo.getAllPresenceEvents();

    const residentMap = new Map(residents.map((r) => [r.id, r]));
    const userMap = new Map(users.map((u) => [u.id, u]));
    const hostelMap = new Map(hostels.map((h) => [h.id, h]));
    const roomMap = new Map(rooms.map((r) => [r.id, r]));

    // Find all evaluations within date range marked as late return
    const lateEvals = evaluations.filter((e) => {
      if (filter.hostelId && e.hostelId !== filter.hostelId) return false;
      if (e.curfewDate < startDate || e.curfewDate > endDate) return false;
      return e.isLateReturn === true || (e.lateMinutes && e.lateMinutes > 0);
    });

    const items: LateReturnReportItem[] = [];

    for (const ev of lateEvals) {
      const res = residentMap.get(ev.residentId);
      const user = res ? userMap.get(res.userId) : null;
      const hostel = res ? hostelMap.get(res.hostelId) : null;
      const room = res ? roomMap.get(res.roomId) : null;

      // Find matching resolved event
      let checkInTime = new Date(ev.evaluatedAt).toISOString();
      let source = 'MOBILE_VERIFICATION';
      if (ev.resolvedEventId) {
        const event = presenceEvents.find((pe) => pe.id === ev.resolvedEventId);
        if (event) {
          checkInTime = new Date(event.serverTimestamp).toISOString();
          source = event.source;
        }
      }

      items.push({
        residentId: ev.residentId,
        rollNumber: res?.rollNumber || 'UNKNOWN',
        residentName: user?.name || 'Resident',
        hostelId: ev.hostelId,
        hostelName: hostel?.name || 'Hostel',
        roomNumber: room?.roomNumber || 'N/A',
        curfewDate: ev.curfewDate,
        curfewDeadline: new Date(ev.curfewDeadline).toISOString(),
        graceDeadline: new Date(ev.graceDeadline).toISOString(),
        checkInTime,
        lateMinutes: ev.lateMinutes || 1,
        source,
        statusReason: ev.statusReason,
      });
    }

    const totalLateReturns = items.length;
    const totalMinutes = items.reduce((sum, item) => sum + item.lateMinutes, 0);
    const averageLateMinutes =
      totalLateReturns > 0 ? Number((totalMinutes / totalLateReturns).toFixed(1)) : 0;
    const maxLateMinutes = items.reduce((max, item) => Math.max(max, item.lateMinutes), 0);

    return {
      reportName: 'Late Return Infractions Report',
      generatedAt: new Date().toISOString(),
      startDate,
      endDate,
      summary: {
        totalLateReturns,
        averageLateMinutes,
        maxLateMinutes,
      },
      records: items,
    };
  }

  exportLateReturnCsv(report: LateReturnReport): string {
    const headers = [
      'Date',
      'Hostel',
      'Roll Number',
      'Resident Name',
      'Room',
      'Curfew Deadline',
      'Grace Deadline',
      'Actual Arrival Time',
      'Late Minutes',
      'Verification Source',
      'Status Reason',
    ];

    const rows = report.records.map((r) => [
      r.curfewDate,
      r.hostelName,
      r.rollNumber,
      r.residentName,
      r.roomNumber,
      r.curfewDeadline,
      r.graceDeadline,
      r.checkInTime,
      r.lateMinutes,
      r.source,
      r.statusReason,
    ]);

    return buildCsv(headers, rows);
  }

  /**
   * 3. Leave Requests Report
   */
  async getLeaveReport(filter: LeaveReportFilter = {}): Promise<LeaveReport> {
    const allLeaves = await this.adminRepo.getLeaveRequests();
    const residents = await this.authRepo.getAllResidents();
    const users = await this.authRepo.getAllUsers();
    const hostels = await this.adminRepo.getHostels();
    const rooms = await this.adminRepo.getRooms();

    const residentMap = new Map(residents.map((r) => [r.id, r]));
    const userMap = new Map(users.map((u) => [u.id, u]));
    const hostelMap = new Map(hostels.map((h) => [h.id, h]));
    const roomMap = new Map(rooms.map((r) => [r.id, r]));

    let filtered = allLeaves;

    if (filter.status) {
      filtered = filtered.filter((l) => l.status === filter.status);
    }
    if (filter.leaveType) {
      filtered = filtered.filter((l) => l.leaveType === filter.leaveType);
    }
    if (filter.date) {
      const targetTime = new Date(`${filter.date}T12:00:00Z`).getTime();
      filtered = filtered.filter((l) => {
        const start = new Date(l.startTime).getTime();
        const end = new Date(l.endTime).getTime();
        return start <= targetTime && end >= targetTime;
      });
    }

    const items: LeaveReportItem[] = [];

    for (const leave of filtered) {
      const resident = residentMap.get(leave.residentId);
      if (filter.hostelId && resident?.hostelId !== filter.hostelId) {
        continue;
      }

      const residentUser = resident ? userMap.get(resident.userId) : null;
      const hostel = resident ? hostelMap.get(resident.hostelId) : null;
      const room = resident ? roomMap.get(resident.roomId) : null;
      const approverUser = leave.approverId ? userMap.get(leave.approverId) : null;

      items.push({
        leaveId: leave.id,
        residentId: leave.residentId,
        rollNumber: resident?.rollNumber || 'UNKNOWN',
        residentName: residentUser?.name || 'Resident',
        hostelId: resident?.hostelId || '',
        hostelName: hostel?.name || 'Hostel',
        roomNumber: room?.roomNumber || 'N/A',
        leaveType: leave.leaveType,
        startTime: new Date(leave.startTime).toISOString(),
        endTime: new Date(leave.endTime).toISOString(),
        status: leave.status,
        reason: leave.reason,
        approverId: leave.approverId || null,
        approverName: approverUser?.name || null,
        approverRole: approverUser?.role || null,
        decisionReason: leave.decisionReason || null,
        decisionTimestamp: leave.decisionTimestamp ? new Date(leave.decisionTimestamp).toISOString() : null,
        createdAt: new Date(leave.createdAt).toISOString(),
      });
    }

    const totalLeaves = items.length;
    const approvedCount = items.filter((l) => l.status === 'APPROVED').length;
    const pendingCount = items.filter((l) => l.status === 'PENDING').length;
    const rejectedCount = items.filter((l) => l.status === 'REJECTED').length;
    const cancelledCount = items.filter((l) => l.status === 'CANCELLED').length;

    return {
      reportName: 'Hostel Leave & Outpass Report',
      generatedAt: new Date().toISOString(),
      summary: {
        totalLeaves,
        approvedCount,
        pendingCount,
        rejectedCount,
        cancelledCount,
      },
      records: items,
    };
  }

  exportLeaveReportCsv(report: LeaveReport): string {
    const headers = [
      'Leave ID',
      'Resident Name',
      'Roll Number',
      'Hostel',
      'Room',
      'Leave Type',
      'Start Time',
      'End Time',
      'Status',
      'Approver',
      'Decision Reason',
      'Created At',
    ];

    const rows = report.records.map((r) => [
      r.leaveId,
      r.residentName,
      r.rollNumber,
      r.hostelName,
      r.roomNumber,
      r.leaveType,
      r.startTime,
      r.endTime,
      r.status,
      r.approverName || 'N/A',
      r.decisionReason || '',
      r.createdAt,
    ]);

    return buildCsv(headers, rows);
  }

  /**
   * 4. Verification Failures & Security Anomalies Report
   */
  async getVerificationFailureReport(
    filter: VerificationFailureFilter = {}
  ): Promise<VerificationFailureReport> {
    const allAttempts = await this.presenceRepo.getAllVerificationAttempts();
    const residents = await this.authRepo.getAllResidents();
    const users = await this.authRepo.getAllUsers();
    const hostels = await this.adminRepo.getHostels();
    const rooms = await this.adminRepo.getRooms();

    const residentMap = new Map(residents.map((r) => [r.id, r]));
    const userMap = new Map(users.map((u) => [u.id, u]));
    const hostelMap = new Map(hostels.map((h) => [h.id, h]));
    const roomMap = new Map(rooms.map((r) => [r.id, r]));

    // Filter failed and rejected attempts
    let failures = allAttempts.filter(
      (a) => a.status === 'FAILED' || a.status === 'REJECTED' || a.status === 'EXPIRED'
    );

    if (filter.reason) {
      failures = failures.filter(
        (a) => a.failureReason && a.failureReason.toLowerCase().includes(filter.reason!.toLowerCase())
      );
    }

    if (filter.date) {
      failures = failures.filter((a) => {
        const d = new Date(a.createdAt).toISOString().split('T')[0];
        return d === filter.date;
      });
    }

    const items: VerificationFailureReportItem[] = [];

    for (const attempt of failures) {
      const resident = residentMap.get(attempt.residentId);
      if (filter.hostelId && resident?.hostelId !== filter.hostelId) {
        continue;
      }

      const user = resident ? userMap.get(resident.userId) : null;
      const hostel = resident ? hostelMap.get(resident.hostelId) : null;
      const room = resident ? roomMap.get(resident.roomId) : null;

      const clientIp = (attempt.clientMetadata?.ip as string) || null;
      const deviceModel = (attempt.clientMetadata?.deviceModel as string) || 'Authorized Mobile';

      items.push({
        attemptId: attempt.id,
        residentId: attempt.residentId,
        rollNumber: resident?.rollNumber || 'UNKNOWN',
        residentName: user?.name || 'Resident',
        hostelId: resident?.hostelId || '',
        hostelName: hostel?.name || 'Hostel',
        roomNumber: room?.roomNumber || 'N/A',
        deviceId: attempt.deviceId,
        deviceModel,
        deviceIdentifier: attempt.deviceId,
        failureReason: attempt.failureReason || 'Verification rejected',
        status: attempt.status,
        clientIp,
        challengeIssuedAt: new Date(attempt.challengeIssuedAt).toISOString(),
        challengeExpiresAt: new Date(attempt.challengeExpiresAt).toISOString(),
      });
    }

    const totalAttempts = items.length;
    const failedCount = items.filter((i) => i.status === 'FAILED').length;
    const rejectedCount = items.filter((i) => i.status === 'REJECTED').length;
    const networkRejectedCount = items.filter(
      (i) => i.failureReason.includes('NETWORK') || i.failureReason.includes('IP_NOT_IN')
    ).length;
    const biometricFailedCount = items.filter(
      (i) => i.failureReason.includes('BIOMETRIC') || i.failureReason.includes('CANCELED')
    ).length;
    const timeoutExpiredCount = items.filter(
      (i) => i.status === 'EXPIRED' || i.failureReason.includes('EXPIRED')
    ).length;

    return {
      reportName: 'Verification Failures & Security Anomalies Report',
      generatedAt: new Date().toISOString(),
      summary: {
        totalAttempts,
        failedCount,
        rejectedCount,
        networkRejectedCount,
        biometricFailedCount,
        timeoutExpiredCount,
      },
      records: items,
    };
  }

  exportVerificationFailureCsv(report: VerificationFailureReport): string {
    const headers = [
      'Attempt ID',
      'Timestamp',
      'Hostel',
      'Roll Number',
      'Resident Name',
      'Device Model',
      'Device ID',
      'Failure Reason',
      'Attempt Status',
      'Client IP',
      'Challenge Expiry',
    ];

    const rows = report.records.map((r) => [
      r.attemptId,
      r.challengeIssuedAt,
      r.hostelName,
      r.rollNumber,
      r.residentName,
      r.deviceModel,
      r.deviceId,
      r.failureReason,
      r.status,
      r.clientIp || '',
      r.challengeExpiresAt,
    ]);

    return buildCsv(headers, rows);
  }

  /**
   * 5. Audit Log Report
   */
  async getAuditReport(filter: AuditLogFilter = {}): Promise<AuditLog[]> {
    return this.auditRepo.getAuditLogs(filter);
  }

  async exportAuditCsv(filter: AuditLogFilter = {}): Promise<string> {
    const logs = await this.auditRepo.getAuditLogs({ ...filter, limit: 10000 });
    const headers = [
      'Audit ID',
      'Timestamp',
      'Actor ID',
      'Actor Role',
      'Action',
      'Target Entity',
      'Target ID',
      'Previous State',
      'New State',
      'Justification Reason',
      'IP Address',
    ];

    const rows = logs.map((l) => [
      l.id,
      new Date(l.timestamp).toISOString(),
      l.actorId || 'SYSTEM',
      l.actorRole,
      l.action,
      l.targetEntity,
      l.targetId,
      l.previousState ? JSON.stringify(l.previousState) : '',
      l.newState ? JSON.stringify(l.newState) : '',
      l.reason,
      l.ipAddress || '',
    ]);

    return buildCsv(headers, rows);
  }
}
