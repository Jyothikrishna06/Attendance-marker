import React, { useState } from 'react';
import { AuditLogItem } from '../types/index.js';

interface AuditLogViewerProps {
  logs: AuditLogItem[];
  selectedEntity: string;
  onEntityChange: (entity: string) => void;
}

export const AuditLogViewer: React.FC<AuditLogViewerProps> = ({
  logs,
  selectedEntity,
  onEntityChange,
}) => {
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);

  const toggleExpand = (id: string) => {
    setExpandedLogId(expandedLogId === id ? null : id);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Target Entity:</span>
          <select
            className="filter-select"
            value={selectedEntity}
            onChange={(e) => onEntityChange(e.target.value)}
          >
            <option value="ALL">All Entities</option>
            <option value="presence_events">presence_events (Record Corrections)</option>
            <option value="curfew_rules">curfew_rules (Curfew Amendments)</option>
            <option value="leave_requests">leave_requests (Outpass Decisions)</option>
            <option value="devices">devices (Hardware Bindings / Revocations)</option>
          </select>
        </div>

        <div style={{ fontSize: '0.8rem', color: 'var(--text-subtle)' }}>
          🔒 Append-Only Immutable Security Ledger
        </div>
      </div>

      {logs.length === 0 ? (
        <div className="table-card">
          <div className="empty-state">
            <div style={{ fontSize: '2rem' }}>📜</div>
            <div className="empty-state-title">No Audit Logs Found</div>
            <p>No recorded administrative mutations match the selected filter.</p>
          </div>
        </div>
      ) : (
        <div className="table-card">
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Timestamp</th>
                  <th>Action</th>
                  <th>Staff Role / Actor</th>
                  <th>Target Entity</th>
                  <th>Mandatory Rationale Reason</th>
                  <th style={{ textAlign: 'right' }}>Details</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <React.Fragment key={log.id}>
                    <tr>
                      <td style={{ fontFamily: 'JetBrains Mono', fontSize: '0.75rem', whiteSpace: 'nowrap' }}>
                        {new Date(log.timestamp).toLocaleString()}
                      </td>

                      <td>
                        <span
                          className="status-badge"
                          style={{
                            background: log.action.includes('CORRECTION') ? 'var(--warning-bg)' : 'var(--primary-light)',
                            color: log.action.includes('CORRECTION') ? 'var(--warning)' : 'var(--primary)',
                            border: `1px solid ${log.action.includes('CORRECTION') ? 'var(--warning-border)' : 'rgba(59,130,246,0.3)'}`,
                            fontSize: '0.7rem',
                          }}
                        >
                          {log.action}
                        </span>
                      </td>

                      <td>
                        <div style={{ fontWeight: 600, fontSize: '0.8rem' }}>{log.actorRole}</div>
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-subtle)', fontFamily: 'JetBrains Mono' }}>
                          {log.actorId ? log.actorId.slice(0, 8) + '...' : 'System'}
                        </div>
                      </td>

                      <td>
                        <code style={{ fontSize: '0.8rem', color: 'var(--cyan)' }}>{log.targetEntity}</code>
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-subtle)', fontFamily: 'JetBrains Mono' }}>
                          ID: {log.targetId.slice(0, 8)}...
                        </div>
                      </td>

                      <td>
                        <div style={{ maxWidth: '300px', fontSize: '0.85rem' }}>
                          "{log.reason}"
                        </div>
                      </td>

                      <td style={{ textAlign: 'right' }}>
                        <button
                          className="btn btn-secondary btn-sm"
                          onClick={() => toggleExpand(log.id)}
                        >
                          {expandedLogId === log.id ? 'Hide Diff' : 'View Diff'}
                        </button>
                      </td>
                    </tr>

                    {expandedLogId === log.id && (
                      <tr>
                        <td colSpan={6} style={{ background: '#090d16', padding: '1rem 1.5rem' }}>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                            <div>
                              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>
                                Previous State:
                              </div>
                              <pre className="diff-box">
                                {log.previousState ? JSON.stringify(log.previousState, null, 2) : '(none)'}
                              </pre>
                            </div>
                            <div>
                              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>
                                New State:
                              </div>
                              <pre className="diff-box" style={{ borderColor: 'rgba(16, 185, 129, 0.4)' }}>
                                {log.newState ? JSON.stringify(log.newState, null, 2) : '(none)'}
                              </pre>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
