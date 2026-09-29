import {
  CurfewEvaluationStatus,
  CurfewEvaluationRecord,
  CurfewRule,
  LeaveRequest,
  PresenceEvent,
  VerificationAttempt,
} from '../../common/types.js';

export { CurfewEvaluationStatus, CurfewEvaluationRecord };

export interface CurfewEvaluationContext {
  hostelId: string;
  date: string; // YYYY-MM-DD
  curfewRule: CurfewRule;
  curfewDeadline: Date;
  graceDeadline: Date;
  evaluationTime: Date;
  timezone: string; // e.g. '+05:30', 'UTC'
}

export interface ResidentEvaluationInput {
  residentId: string;
  leaveRequests: LeaveRequest[];
  presenceEvents: PresenceEvent[];
  verificationAttempts: VerificationAttempt[];
}

export interface ResidentEvaluationResult {
  residentId: string;
  status: CurfewEvaluationStatus;
  statusReason: string;
  curfewDate: string;
  curfewDeadline: Date;
  graceDeadline: Date;
  evaluatedAt: Date;
  isLateReturn: boolean;
  lateMinutes?: number | null;
  resolvedEventId?: string | null;
  resolvedLeaveId?: string | null;
}

export interface CurfewEvaluationSummary {
  totalResidents: number;
  verifiedInside: number;
  approvedLeave: number;
  pendingVerification: number;
  notVerified: number;
  verificationFailed: number;
}

export interface HostelCurfewEvaluationResult {
  hostelId: string;
  hostelName?: string;
  curfewDate: string;
  curfewDeadline: string;
  graceDeadline: string;
  evaluatedAt: string;
  timezone: string;
  summary: CurfewEvaluationSummary;
  results: ResidentEvaluationResult[];
}

export interface CurfewEvaluationOptions {
  hostelId: string;
  date?: string; // Defaults to today YYYY-MM-DD
  evaluationTime?: Date; // Defaults to new Date()
  timezone?: string; // Defaults to '+05:30' (IST)
  persist?: boolean; // Defaults to true
}
