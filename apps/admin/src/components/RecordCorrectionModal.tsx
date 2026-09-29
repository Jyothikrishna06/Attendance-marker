import React, { useState } from 'react';
import { ResidentStatusItem, ResidentStatus } from '../types/index.js';

interface RecordCorrectionModalProps {
  resident: ResidentStatusItem;
  onClose: () => void;
  onSubmit: (residentId: string, newStatus: ResidentStatus, reason: string) => Promise<void>;
}

export const RecordCorrectionModal: React.FC<RecordCorrectionModalProps> = ({
  resident,
  onClose,
  onSubmit,
}) => {
  const [newStatus, setNewStatus] = useState<ResidentStatus>('VERIFIED_INSIDE');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reason.trim()) {
      setError('A mandatory non-empty justification reason is required to correct attendance records.');
      return;
    }

    try {
      setLoading(true);
      setError(null);
      await onSubmit(resident.residentId, newStatus, reason.trim());
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Failed to submit presence record correction');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal">
        <div className="modal-header">
          <h3>Warden Presence Record Correction</h3>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            {error && <div className="alert-banner" style={{ marginBottom: '0.5rem' }}>{error}</div>}

            <div style={{ background: '#0f172a', padding: '0.85rem', borderRadius: '8px', border: '1px solid var(--border)' }}>
              <div style={{ fontWeight: 600, fontSize: '0.95rem' }}>{resident.name}</div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                Roll: {resident.rollNumber} • {resident.hostelName} • Room {resident.roomNumber} (Floor {resident.floor})
              </div>
              <div style={{ marginTop: '0.35rem', fontSize: '0.8rem' }}>
                Current Reported State: <strong style={{ color: 'var(--warning)' }}>{resident.currentStatus}</strong>
              </div>
            </div>

            <div className="form-group">
              <label className="form-label required">Corrected Presence Status</label>
              <select
                className="filter-select"
                value={newStatus}
                onChange={(e) => setNewStatus(e.target.value as ResidentStatus)}
                required
              >
                <option value="VERIFIED_INSIDE">🟢 VERIFIED_INSIDE (Confirmed physically in hostel/room)</option>
                <option value="VERIFIED_OUTSIDE">🔵 VERIFIED_OUTSIDE (Confirmed departed / outside hostel)</option>
                <option value="FLAGGED">🔴 FLAGGED (Disciplinary curfew violation / Proxy attempt)</option>
              </select>
            </div>

            <div className="form-group">
              <label className="form-label required">Mandatory Justification Reason</label>
              <textarea
                className="form-textarea"
                placeholder="State the verified physical evidence for this correction (e.g. 'Conducted physical head count in room 101 at 21:45; student was present and asleep; phone was charging')..."
                value={reason}
                onChange={(e) => {
                  setReason(e.target.value);
                  if (e.target.value.trim()) setError(null);
                }}
                required
                rows={3}
              />
              <span className="form-hint">
                ⚠️ Institutional Policy: This justification will be committed transactionally to the immutable audit log under your warden staff credentials.
              </span>
            </div>
          </div>

          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={loading}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? 'Committing...' : 'Commit Record Correction'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
