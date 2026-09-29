import React, { useState } from 'react';
import { CurrentCurfewPolicy } from '../types/index.js';

interface CurfewStatusCardProps {
  policy: CurrentCurfewPolicy | null;
  onUpdatePolicy: (ruleId: string, curfewTime: string, graceMinutes: number, justification: string) => Promise<void>;
}

export const CurfewStatusCard: React.FC<CurfewStatusCardProps> = ({ policy, onUpdatePolicy }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [curfewTime, setCurfewTime] = useState(policy?.curfewTime || '21:30:00');
  const [graceMinutes, setGraceMinutes] = useState(policy?.gracePeriodMinutes || 15);
  const [justification, setJustification] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (!policy) {
    return (
      <div className="curfew-banner">
        <div>Loading active curfew policy...</div>
      </div>
    );
  }

  const formatTime = (isoString?: string) => {
    if (!isoString) return '--:--';
    return new Date(isoString).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!justification.trim()) {
      setError('A mandatory reason is required to modify curfew rules.');
      return;
    }
    try {
      setLoading(true);
      setError(null);
      await onUpdatePolicy(policy.ruleId, curfewTime, Number(graceMinutes), justification.trim());
      setIsEditing(false);
      setJustification('');
    } catch (err: any) {
      setError(err?.message || 'Failed to update curfew policy');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <div className="curfew-banner">
        <div className="curfew-banner-info">
          <h2>
            <span>🌙</span>
            <span>Active Curfew Enforcement Policy — {policy.hostelName}</span>
          </h2>
          <div className="curfew-banner-details">
            <div className="curfew-meta-item">
              <span className="curfew-meta-label">Curfew Deadline</span>
              <span className="curfew-meta-value">{policy.curfewTime} ({formatTime(policy.curfewDeadline)})</span>
            </div>
            <div className="curfew-meta-item">
              <span className="curfew-meta-label">Grace Period</span>
              <span className="curfew-meta-value">+{policy.gracePeriodMinutes} mins</span>
            </div>
            <div className="curfew-meta-item">
              <span className="curfew-meta-label">Grace Expiry</span>
              <span className="curfew-meta-value">{formatTime(policy.graceDeadline)}</span>
            </div>
            <div className="curfew-meta-item">
              <span className="curfew-meta-label">Curfew Date</span>
              <span className="curfew-meta-value">{policy.curfewDate}</span>
            </div>
          </div>
        </div>

        <div className="curfew-banner-action">
          <button className="btn btn-secondary" onClick={() => setIsEditing(true)}>
            ✏️ Amend Curfew
          </button>
        </div>
      </div>

      {isEditing && (
        <div className="modal-overlay">
          <div className="modal">
            <div className="modal-header">
              <h3>Amend Curfew Policy ({policy.hostelName})</h3>
              <button className="modal-close" onClick={() => setIsEditing(false)}>✕</button>
            </div>
            <form onSubmit={handleSave}>
              <div className="modal-body">
                {error && <div className="alert-banner" style={{ marginBottom: '0.5rem' }}>{error}</div>}

                <div className="form-group">
                  <label className="form-label required">Curfew Deadline Time (HH:MM:SS)</label>
                  <input
                    type="text"
                    className="filter-input"
                    value={curfewTime}
                    onChange={(e) => setCurfewTime(e.target.value)}
                    placeholder="21:30:00"
                    required
                  />
                  <span className="form-hint">24-hour military clock format (e.g. 21:30:00 for 9:30 PM).</span>
                </div>

                <div className="form-group">
                  <label className="form-label required">Grace Window (Minutes)</label>
                  <input
                    type="number"
                    min="0"
                    max="120"
                    className="filter-input"
                    value={graceMinutes}
                    onChange={(e) => setGraceMinutes(Number(e.target.value))}
                    required
                  />
                </div>

                <div className="form-group">
                  <label className="form-label required">Mandatory Institutional Justification</label>
                  <textarea
                    className="form-textarea"
                    placeholder="Explain why the curfew is being amended (e.g. Approved campus cultural festival, emergency lockdown)..."
                    value={justification}
                    onChange={(e) => {
                      setJustification(e.target.value);
                      if (e.target.value.trim()) setError(null);
                    }}
                    required
                  />
                  <span className="form-hint">This rationale will be recorded immutably in the audit log.</span>
                </div>
              </div>

              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setIsEditing(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={loading}>
                  {loading ? 'Saving...' : 'Commit Curfew Amendment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
};
