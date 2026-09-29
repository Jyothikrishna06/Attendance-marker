import { IAuditRepository } from './audit.repository.js';
import { AuditEventInput, AuditLogFilter, AuditAction, AuditTargetEntity } from './audit.types.js';
import { AuditLog } from '../../common/types.js';
import { NotFoundError, ValidationError } from '../../common/errors.js';

export interface IAuditService {
  recordAuditEvent(input: AuditEventInput): Promise<AuditLog>;
  getAuditLogs(filter?: AuditLogFilter): Promise<AuditLog[]>;
  getAuditLogById(id: string): Promise<AuditLog>;
  exportAuditLogsCsv(filter?: AuditLogFilter): Promise<string>;
}

export class AuditService implements IAuditService {
  constructor(private auditRepo: IAuditRepository) {}

  /**
   * Records an immutable audit log entry.
   * Enforces mandatory non-empty justification reason.
   */
  async recordAuditEvent(input: AuditEventInput): Promise<AuditLog> {
    if (!input.reason || !input.reason.trim()) {
      throw new ValidationError(
        'Mandatory non-empty justification reason is required for immutable audit logging.',
        { field: 'reason', code: 'MANDATORY_AUDIT_REASON_REQUIRED' }
      );
    }

    return this.auditRepo.createAuditLog({
      ...input,
      reason: input.reason.trim(),
    });
  }

  async getAuditLogs(filter?: AuditLogFilter): Promise<AuditLog[]> {
    return this.auditRepo.getAuditLogs(filter);
  }

  async getAuditLogById(id: string): Promise<AuditLog> {
    const log = await this.auditRepo.findAuditLogById(id);
    if (!log) {
      throw new NotFoundError(`Audit log entry ${id} not found in immutable ledger.`);
    }
    return log;
  }

  /**
   * Generates RFC-4180 compliant CSV export of audit logs.
   */
  async exportAuditLogsCsv(filter?: AuditLogFilter): Promise<string> {
    const logs = await this.auditRepo.getAuditLogs({ ...filter, limit: 10000 });

    const headers = [
      'Audit ID',
      'Timestamp (ISO)',
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

    const escapeCsv = (val: unknown): string => {
      if (val === null || val === undefined) return '';
      let str = typeof val === 'object' ? JSON.stringify(val) : String(val);
      if (str.includes('"') || str.includes(',') || str.includes('\n') || str.includes('\r')) {
        str = `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    const rows = logs.map((log) => [
      log.id,
      new Date(log.timestamp).toISOString(),
      log.actorId || 'SYSTEM',
      log.actorRole,
      log.action,
      log.targetEntity,
      log.targetId,
      log.previousState ? JSON.stringify(log.previousState) : '',
      log.newState ? JSON.stringify(log.newState) : '',
      log.reason,
      log.ipAddress || '',
    ]);

    const headerLine = headers.map(escapeCsv).join(',');
    const dataLines = rows.map((r) => r.map(escapeCsv).join(','));
    return [headerLine, ...dataLines].join('\r\n');
  }
}
