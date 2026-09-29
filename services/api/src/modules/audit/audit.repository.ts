import crypto from 'crypto';
import { AuditLog } from '../../common/types.js';
import { AuditEventInput, AuditLogFilter, AuditLogImmutableError } from './audit.types.js';
import { ValidationError } from '../../common/errors.js';

export interface IAuditRepository {
  createAuditLog(event: AuditEventInput): Promise<AuditLog>;
  getAuditLogs(filter?: AuditLogFilter): Promise<AuditLog[]>;
  findAuditLogById(id: string): Promise<AuditLog | null>;
  countAuditLogs(filter?: AuditLogFilter): Promise<number>;
  updateAuditLog(id: string, updates: Partial<AuditLog>): never;
  deleteAuditLog(id: string): never;
}

export class InMemoryAuditRepository implements IAuditRepository {
  private auditLogs: AuditLog[] = [];

  constructor() {
    this.seedInitialData();
  }

  private seedInitialData(): void {
    this.auditLogs.push({
      id: '90000000-0000-0000-0000-000000000001',
      actorId: 'c0000000-0000-0000-0000-000000000001',
      actorRole: 'SUPER_ADMIN',
      action: 'CURFEW_RULE_CREATED',
      targetEntity: 'curfew_rules',
      targetId: '70000000-0000-0000-0000-000000000001',
      previousState: null,
      newState: { curfew_time: '21:30:00', grace_period_minutes: 15 },
      reason: 'Initial academic term curfew policy configuration',
      ipAddress: '10.42.0.1',
      timestamp: new Date('2026-01-01T08:00:00.000Z'),
    });
  }

  async createAuditLog(event: AuditEventInput): Promise<AuditLog> {
    if (!event.reason || !event.reason.trim()) {
      throw new ValidationError(
        'Database Check Constraint: Mandatory non-empty reason is required for immutable audit logging.',
        { field: 'reason', code: 'CHK_AUDIT_REASON_NOT_EMPTY' }
      );
    }

    const newLog: AuditLog = {
      id: crypto.randomUUID(),
      actorId: event.actorId ?? null,
      actorRole: event.actorRole,
      action: event.action,
      targetEntity: event.targetEntity,
      targetId: event.targetId,
      previousState: event.previousState ? JSON.parse(JSON.stringify(event.previousState)) : null,
      newState: event.newState ? JSON.parse(JSON.stringify(event.newState)) : null,
      reason: event.reason.trim(),
      ipAddress: event.ipAddress ?? null,
      timestamp: new Date(),
    };

    // Prepend newest first (chronological reverse)
    this.auditLogs.unshift(Object.freeze({ ...newLog }));
    return JSON.parse(JSON.stringify(newLog));
  }

  async getAuditLogs(filter?: AuditLogFilter): Promise<AuditLog[]> {
    let logs = [...this.auditLogs];

    if (filter?.targetEntity) {
      logs = logs.filter(
        (l) => l.targetEntity.toLowerCase() === filter.targetEntity!.toLowerCase()
      );
    }
    if (filter?.targetId) {
      logs = logs.filter((l) => l.targetId === filter.targetId);
    }
    if (filter?.action) {
      logs = logs.filter((l) => l.action.toLowerCase() === filter.action!.toLowerCase());
    }
    if (filter?.actorId) {
      logs = logs.filter((l) => l.actorId === filter.actorId);
    }
    if (filter?.actorRole) {
      logs = logs.filter((l) => l.actorRole.toUpperCase() === filter.actorRole!.toUpperCase());
    }
    if (filter?.startDate) {
      const start = new Date(filter.startDate).getTime();
      logs = logs.filter((l) => new Date(l.timestamp).getTime() >= start);
    }
    if (filter?.endDate) {
      const end = new Date(filter.endDate).getTime();
      logs = logs.filter((l) => new Date(l.timestamp).getTime() <= end);
    }

    const offset = filter?.offset || 0;
    const limit = filter?.limit || 100;
    const paged = logs.slice(offset, offset + limit);

    // Return deep copies so caller cannot mutate internal state
    return JSON.parse(JSON.stringify(paged));
  }

  async findAuditLogById(id: string): Promise<AuditLog | null> {
    const found = this.auditLogs.find((l) => l.id === id);
    return found ? JSON.parse(JSON.stringify(found)) : null;
  }

  async countAuditLogs(filter?: AuditLogFilter): Promise<number> {
    const logs = await this.getAuditLogs({ ...filter, limit: 100000, offset: 0 });
    return logs.length;
  }

  /**
   * Database & Security Immutability Enforcement:
   * UPDATE operations are strictly prohibited on the audit ledger.
   */
  updateAuditLog(_id: string, _updates: Partial<AuditLog>): never {
    throw new AuditLogImmutableError(
      'Security Policy Violation: audit_logs records are immutable and append-only. UPDATE operations are strictly forbidden.'
    );
  }

  /**
   * Database & Security Immutability Enforcement:
   * DELETE operations are strictly prohibited on the audit ledger.
   */
  deleteAuditLog(_id: string): never {
    throw new AuditLogImmutableError(
      'Security Policy Violation: audit_logs records are immutable and append-only. DELETE operations are strictly forbidden.'
    );
  }
}
