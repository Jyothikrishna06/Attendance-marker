import { AuditLog } from '../../common/types.js';

export type AuditAction =
  | 'ACCOUNT_ACTIVATED'
  | 'ACCOUNT_DEACTIVATED'
  | 'USER_STATUS_UPDATED'
  | 'DEVICE_REGISTERED'
  | 'DEVICE_REVOKED'
  | 'DEVICE_REPLACED'
  | 'RECORD_CORRECTION'
  | 'LEAVE_STATUS_UPDATED'
  | 'CURFEW_RULE_CREATED'
  | 'CURFEW_RULE_UPDATED'
  | 'ADMIN_OVERRIDE'
  | 'CURFEW_EVALUATION_EXECUTED';

export type AuditTargetEntity =
  | 'users'
  | 'residents'
  | 'devices'
  | 'presence_events'
  | 'leave_requests'
  | 'curfew_rules'
  | 'admin_actions'
  | 'curfew_evaluations';

export interface AuditEventInput {
  actorId?: string | null;
  actorRole: string;
  action: AuditAction | string;
  targetEntity: AuditTargetEntity | string;
  targetId: string;
  previousState?: Record<string, unknown> | null;
  newState?: Record<string, unknown> | null;
  reason: string;
  ipAddress?: string | null;
}

export interface AuditLogFilter {
  targetEntity?: string;
  targetId?: string;
  action?: string;
  actorId?: string;
  actorRole?: string;
  startDate?: string;
  endDate?: string;
  limit?: number;
  offset?: number;
}

export class AuditLogImmutableError extends Error {
  public readonly code = 'AUDIT_LOG_IMMUTABLE';
  public readonly statusCode = 403;

  constructor(message = 'Security Policy Violation: Audit log records are immutable and append-only. UPDATE and DELETE operations are strictly forbidden.') {
    super(message);
    this.name = 'AuditLogImmutableError';
  }
}
