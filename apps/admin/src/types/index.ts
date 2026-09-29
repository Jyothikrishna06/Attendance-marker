export type UserRole = 'RESIDENT' | 'WARDEN' | 'ADMIN' | 'SUPER_ADMIN';

export interface UserSession {
  userId: string;
  name: string;
  email: string;
  role: UserRole;
  accessToken: string;
  refreshToken: string;
}

export type ResidentStatus =
  | 'VERIFIED_INSIDE'
  | 'VERIFIED_OUTSIDE'
  | 'APPROVED_LEAVE'
  | 'PENDING_VERIFICATION'
  | 'VERIFICATION_FAILED';

export interface FailureAlert {
  attemptId: string;
  failureReason: string;
  timestamp: string;
}

export interface ActiveLeave {
  id: string;
  leaveType: string;
  endTime: string;
}

export interface ResidentStatusItem {
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
  currentStatus: ResidentStatus;
  lastEventType?: 'ENTRY' | 'EXIT' | null;
  lastSeen?: string | null;
  activeDeviceId?: string | null;
  activeDeviceModel?: string | null;
  failureAlert?: FailureAlert | null;
  activeLeave?: ActiveLeave | null;
  emergencyContact: {
    name: string;
    phone: string;
  };
}

export interface CurfewSummary {
  totalTracked: number;
  verifiedInside: number;
  verifiedOutside: number;
  approvedLeave: number;
  pendingVerification: number;
  verificationFailed: number;
}

export interface CurrentCurfewPolicy {
  ruleId: string;
  hostelId: string;
  hostelName: string;
  curfewTime: string;
  gracePeriodMinutes: number;
  curfewDeadline: string;
  graceDeadline: string;
  dayOfWeek: number | null;
  curfewDate: string;
}

export interface LeaveRequest {
  id: string;
  residentId: string;
  residentName: string;
  residentEmail: string;
  rollNumber: string;
  hostelName: string;
  hostelCode: string;
  roomNumber: string;
  leaveType: 'OUTPASS' | 'NIGHT_OUT' | 'EMERGENCY' | 'HOME_VISIT';
  startTime: string;
  endTime: string;
  reason: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';
  approverId?: string | null;
  decisionReason?: string | null;
  decisionTimestamp?: string | null;
  createdAt: string;
}

export interface AuditLogItem {
  id: string;
  actorId?: string | null;
  actorRole: string;
  action: string;
  targetEntity: string;
  targetId: string;
  previousState?: Record<string, unknown> | null;
  newState?: Record<string, unknown> | null;
  reason: string;
  ipAddress?: string | null;
  timestamp: string;
}

export interface FilterState {
  hostelId: string;
  floor: string;
  roomSearch: string;
  status: string;
  searchTerm: string;
}
