import {
  CurfewRule,
  LeaveRequest,
  LeaveType,
  LeaveStatus,
  AuditLog,
  PresenceEventStatus,
  PresenceSource,
  Hostel,
  Room,
} from '../../common/types.js';

export interface CreateCurfewRuleInput {
  hostelId: string;
  dayOfWeek?: number | null; // 0-6 or null
  curfewTime: string; // HH:MM:SS or HH:MM
  gracePeriodMinutes?: number;
  effectiveFrom?: string; // YYYY-MM-DD
  effectiveTo?: string | null;
  justification?: string;
}

export interface UpdateCurfewRuleInput {
  curfewTime?: string;
  gracePeriodMinutes?: number;
  dayOfWeek?: number | null;
  isActive?: boolean;
  effectiveTo?: string | null;
  justification?: string;
}

export interface CurrentCurfewResponse {
  ruleId: string;
  hostelId: string;
  hostelName: string;
  curfewTime: string;
  gracePeriodMinutes: number;
  curfewDeadline: string; // ISO string for today's deadline
  graceDeadline: string; // ISO string for deadline + grace period
  dayOfWeek: number | null;
  curfewDate: string; // YYYY-MM-DD
}

export interface CurfewStatusFilters {
  hostelId?: string;
  floor?: number;
  block?: string;
  roomNumber?: string;
  status?: string;
}

export interface ResidentCurfewStatusItem {
  residentId: string;
  userId: string;
  name: string;
  email: string;
  rollNumber: string;
  hostelId: string;
  hostelName: string;
  hostelCode: string;
  roomId: string;
  roomNumber: string;
  floor: number;
  currentStatus: 'VERIFIED_INSIDE' | 'VERIFIED_OUTSIDE' | 'APPROVED_LEAVE' | 'PENDING_VERIFICATION' | 'VERIFICATION_FAILED';
  lastEventType?: 'ENTRY' | 'EXIT' | null;
  lastSeen?: string | null;
  activeDeviceId?: string | null;
  activeDeviceModel?: string | null;
  failureAlert?: {
    attemptId: string;
    failureReason: string;
    timestamp: string;
  } | null;
  activeLeave?: {
    id: string;
    leaveType: LeaveType;
    endTime: string;
  } | null;
  emergencyContact: {
    name: string;
    phone: string;
  };
}

export interface CurfewStatusSummary {
  totalTracked: number;
  verifiedInside: number;
  verifiedOutside: number;
  approvedLeave: number;
  pendingVerification: number;
  verificationFailed: number;
}

export interface CurfewStatusResponse {
  summary: CurfewStatusSummary;
  roster: ResidentCurfewStatusItem[];
  timestamp: string;
}

export interface EnrichedLeaveRequest extends LeaveRequest {
  residentName: string;
  residentEmail: string;
  rollNumber: string;
  roomNumber: string;
  hostelName: string;
  hostelCode: string;
}

export interface LeaveRequestFilter {
  status?: LeaveStatus;
  residentId?: string;
  hostelId?: string;
}

export interface UpdateLeaveStatusInput {
  status: 'APPROVED' | 'REJECTED';
  decisionReason: string;
}

export interface RecordCorrectionInput {
  eventId?: string;
  residentId: string;
  status: PresenceEventStatus;
  curfewDate?: string;
  reason: string;
}

export interface RecordCorrectionResponse {
  eventId: string;
  residentId: string;
  previousStatus: string;
  newStatus: PresenceEventStatus;
  source: PresenceSource;
  serverTimestamp: string;
  reason: string;
  auditLogId: string;
}

export interface AuditLogFilter {
  targetEntity?: string;
  action?: string;
  actorId?: string;
  limit?: number;
  offset?: number;
}
