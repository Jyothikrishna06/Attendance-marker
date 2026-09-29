import React, { useState } from 'react';
import { LeaveRequest } from '../types/index.js';

interface LeaveApprovalQueueProps {
  leaves: LeaveRequest[];
  onAdjudicate: (leaveId: string, status: 'APPROVED' | 'REJECTED', decisionReason: string) => Promise<void>;
}

export const LeaveApprovalQueue: React.FC<LeaveApprovalQueueProps> = ({ leaves, onAdjudicate }) => {
  const [activeTab, setActiveTab] = useState<'PENDING' | 'DECIDED'>('PENDING');
  const [selectedLeave, setSelectedLeave] = useState<LeaveRequest | null>(null);
  const [decisionType, setDecisionType] = useState<'APPROVED' | 'REJECTED'>('APPROVED');
  const [decisionReason, setDecisionReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const pendingLeaves = leaves.filter((l) => l.status === 'PENDING');
  const decidedLeaves = leaves.filter((l) => l.status !== 'PENDING');

  const displayedLeaves = activeTab === 'PENDING' ? pendingLeaves : decidedLeaves;

  const openDecisionModal = (leave: LeaveRequest, type: 'APPROVED' | 'REJECTED') => {
    setSelectedLeave(leave);
    setDecisionType(type);
    setDecisionReason('');
    setError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedLeave) return;

    if (!decisionReason.trim()) {
      setError('A mandatory justification reason is required to render a leave decision.');
      return;
    }

    try {
      setLoading(true);
      setError(null);
      await onAdjudicate(selectedLeave.id, decisionType, decisionReason.trim());
      setSelectedLeave(null);
    } catch (err: any) {
      setError(err?.message || 'Failed to submit leave decision');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div style={{ display: 'flex', gap: '0.5rem', borderBottom: '1px solid var(--border)', paddingBottom: '0.5rem' }}>
        <button
          className={`btn ${activeTab === 'PENDING' ? 'btn-primary' : 'btn-secondary'} btn-sm`}
          onClick={() => setActiveTab('PENDING')}
        >
          Pending Requests ({pendingLeaves.length})
        </button>
        <button
          className={`btn ${activeTab === 'DECIDED' ? 'btn-primary' : 'btn-secondary'} btn-sm`}
          onClick={() => setActiveTab('DECIDED')}
        >
          Past Decided Requests ({decidedLeaves.length})
        </button>
      </div>

      {displayedLeaves.length === 0 ? (
        <div className="table-card">
          <div className="empty-state">
            <div style={{ fontSize: '2rem' }}>🎉</div>
            <div className="empty-state-title">No {activeTab === 'PENDING' ? 'Pending' : 'Decided'} Leave Requests</div>
            <p>{activeTab === 'PENDING' ? 'All student outpass applications have been reviewed.' : 'No previous leave decisions recorded.'}</p>
          </div>
        </div>
      ) : (
        <div className="table-card">
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Resident Student</th>
                  <th>Location</th>
                  <th>Leave Type</th>
                  <th>Departure & Return</th>
                  <th>Student Rationale</th>
                  <th>Status</th>
                  <th style={{ textAlign: 'right' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {displayedLeaves.map((leave) => (
                  <tr key={leave.id}>
                    <td>
                      <div style={{ fontWeight: 600 }}>{leave.residentName}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        Roll: {leave.rollNumber}
                      </div>
                    </td>

                    <td>
                      <div>{leave.hostelName}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        Room {leave.roomNumber}
                      </div>
                    </td>

                    <td>
                      <span className="status-badge" style={{ background: 'var(--purple-bg)', color: '#c084fc', border: '1px solid var(--purple-border)' }}>
                        {leave.leaveType}
                      </span>
                    </td>

                    <td>
                      <div style={{ fontSize: '0.8rem', fontFamily: 'JetBrains Mono' }}>
                        Out: {new Date(leave.startTime).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </div>
                      <div style={{ fontSize: '0.8rem', fontFamily: 'JetBrains Mono', color: 'var(--text-muted)' }}>
                        Back: {new Date(leave.endTime).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </td>

                    <td>
                      <div style={{ maxWidth: '280px', fontSize: '0.85rem' }}>
                        "{leave.reason}"
                      </div>
                      {leave.decisionReason && (
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-subtle)', marginTop: '0.25rem' }}>
                          <strong>Staff Decision:</strong> {leave.decisionReason}
                        </div>
                      )}
                    </td>

                    <td>
                      <span
                        className="status-badge"
                        style={{
                          background: leave.status === 'APPROVED' ? 'var(--success-bg)' : leave.status === 'REJECTED' ? 'var(--danger-bg)' : 'var(--warning-bg)',
                          color: leave.status === 'APPROVED' ? 'var(--success)' : leave.status === 'REJECTED' ? 'var(--danger)' : 'var(--warning)',
                          border: `1px solid ${leave.status === 'APPROVED' ? 'var(--success-border)' : leave.status === 'REJECTED' ? 'var(--danger-border)' : 'var(--warning-border)'}`,
                        }}
                      >
                        {leave.status}
                      </span>
                    </td>

                    <td style={{ textAlign: 'right' }}>
                      {leave.status === 'PENDING' ? (
                        <div style={{ display: 'inline-flex', gap: '0.35rem' }}>
                          <button
                            className="btn btn-primary btn-sm"
                            onClick={() => openDecisionModal(leave, 'APPROVED')}
                            style={{ background: 'var(--success)' }}
                          >
                            ✓ Approve
                          </button>
                          <button
                            className="btn btn-danger btn-sm"
                            onClick={() => openDecisionModal(leave, 'REJECTED')}
                          >
                            ✕ Reject
                          </button>
                        </div>
                      ) : (
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-subtle)' }}>Decided</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {selectedLeave && (
        <div className="modal-overlay">
          <div className="modal">
            <div className="modal-header">
              <h3>
                {decisionType === 'APPROVED' ? '✅ Approve Leave Request' : '❌ Reject Leave Request'}
              </h3>
              <button className="modal-close" onClick={() => setSelectedLeave(null)}>✕</button>
            </div>

            <form onSubmit={handleSubmit}>
              <div className="modal-body">
                {error && <div className="alert-banner" style={{ marginBottom: '0.5rem' }}>{error}</div>}

                <div style={{ background: '#0f172a', padding: '0.85rem', borderRadius: '8px', border: '1px solid var(--border)' }}>
                  <div style={{ fontWeight: 600 }}>{selectedLeave.residentName} ({selectedLeave.rollNumber})</div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                    {selectedLeave.leaveType} • Room {selectedLeave.roomNumber} ({selectedLeave.hostelName})
                  </div>
                  <div style={{ fontSize: '0.85rem', marginTop: '0.35rem' }}>
                    Reason: <em>"{selectedLeave.reason}"</em>
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label required">
                    Mandatory Decision Reason / Verification Notes
                  </label>
                  <textarea
                    className="form-textarea"
                    placeholder={
                      decisionType === 'APPROVED'
                        ? "Enter verification notes (e.g. 'Verified parent telephone consent and hackathon invite')..."
                        : "Enter justification for denial (e.g. 'Academic examination scheduled tomorrow; no parent consent letter')..."
                    }
                    value={decisionReason}
                    onChange={(e) => {
                      setDecisionReason(e.target.value);
                      if (e.target.value.trim()) setError(null);
                    }}
                    required
                    rows={3}
                  />
                  <span className="form-hint">
                    This reason is recorded immutably in the student's record and system audit trail.
                  </span>
                </div>
              </div>

              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setSelectedLeave(null)} disabled={loading}>
                  Cancel
                </button>
                <button
                  type="submit"
                  className={`btn ${decisionType === 'APPROVED' ? 'btn-primary' : 'btn-danger'}`}
                  disabled={loading}
                >
                  {loading ? 'Submitting...' : `Confirm ${decisionType}`}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
