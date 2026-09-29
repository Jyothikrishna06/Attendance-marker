import { CurfewEvaluationStatus, LeaveType, LeaveStatus } from '../../common/types.js';

export interface DailyAttendanceReportItem {
  residentId: string;
  rollNumber: string;
  residentName: string;
  hostelId: string;
  hostelName: string;
  hostelCode: string;
  roomNumber: string;
  floor: number;
  curfewDate: string;
  curfewStatus: CurfewEvaluationStatus;
  statusReason: string;
  curfewDeadline: string;
  graceDeadline: string;
  checkInTime: string | null;
  verificationMethod: string;
  isLateReturn: boolean;
  lateMinutes: number | null;
  leaveType: LeaveType | null;
}

export interface DailyAttendanceReportSummary {
  totalResidents: number;
  verifiedInside: number;
  approvedLeave: number;
  pendingVerification: number;
  notVerified: number;
  verificationFailed: number;
  attendanceRatePercentage: number;
}

export interface DailyAttendanceReport {
  reportName: string;
  curfewDate: string;
  hostelId: string | null;
  hostelName: string;
  generatedAt: string;
  summary: DailyAttendanceReportSummary;
  records: DailyAttendanceReportItem[];
}

export interface LateReturnReportItem {
  residentId: string;
  rollNumber: string;
  residentName: string;
  hostelId: string;
  hostelName: string;
  roomNumber: string;
  curfewDate: string;
  curfewDeadline: string;
  graceDeadline: string;
  checkInTime: string;
  lateMinutes: number;
  source: string;
  statusReason: string;
}

export interface LateReturnReportSummary {
  totalLateReturns: number;
  averageLateMinutes: number;
  maxLateMinutes: number;
}

export interface LateReturnReport {
  reportName: string;
  generatedAt: string;
  startDate: string;
  endDate: string;
  summary: LateReturnReportSummary;
  records: LateReturnReportItem[];
}

export interface LeaveReportItem {
  leaveId: string;
  residentId: string;
  rollNumber: string;
  residentName: string;
  hostelId: string;
  hostelName: string;
  roomNumber: string;
  leaveType: LeaveType;
  startTime: string;
  endTime: string;
  status: LeaveStatus;
  reason: string;
  approverId: string | null;
  approverName: string | null;
  approverRole: string | null;
  decisionReason: string | null;
  decisionTimestamp: string | null;
  createdAt: string;
}

export interface LeaveReportSummary {
  totalLeaves: number;
  approvedCount: number;
  pendingCount: number;
  rejectedCount: number;
  cancelledCount: number;
}

export interface LeaveReport {
  reportName: string;
  generatedAt: string;
  summary: LeaveReportSummary;
  records: LeaveReportItem[];
}

export interface VerificationFailureReportItem {
  attemptId: string;
  residentId: string;
  rollNumber: string;
  residentName: string;
  hostelId: string;
  hostelName: string;
  roomNumber: string;
  deviceId: string;
  deviceModel: string;
  deviceIdentifier: string;
  failureReason: string;
  status: string;
  clientIp: string | null;
  challengeIssuedAt: string;
  challengeExpiresAt: string;
}

export interface VerificationFailureReportSummary {
  totalAttempts: number;
  failedCount: number;
  rejectedCount: number;
  networkRejectedCount: number;
  biometricFailedCount: number;
  timeoutExpiredCount: number;
}

export interface VerificationFailureReport {
  reportName: string;
  generatedAt: string;
  summary: VerificationFailureReportSummary;
  records: VerificationFailureReportItem[];
}

export interface DailyAttendanceFilter {
  hostelId?: string;
  date?: string;
  status?: string;
  format?: 'json' | 'csv';
}

export interface LateReturnFilter {
  hostelId?: string;
  date?: string;
  startDate?: string;
  endDate?: string;
  format?: 'json' | 'csv';
}

export interface LeaveReportFilter {
  hostelId?: string;
  date?: string;
  status?: LeaveStatus;
  leaveType?: LeaveType;
  format?: 'json' | 'csv';
}

export interface VerificationFailureFilter {
  hostelId?: string;
  date?: string;
  reason?: string;
  format?: 'json' | 'csv';
}
