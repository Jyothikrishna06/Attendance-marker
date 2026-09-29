import React from 'react';
import { ResidentStatusItem } from '../types/index.js';

interface VerificationFailureAlertsProps {
  failedResidents: ResidentStatusItem[];
  onCorrectRecord: (resident: ResidentStatusItem) => void;
}

export const VerificationFailureAlerts: React.FC<VerificationFailureAlertsProps> = ({
  failedResidents,
  onCorrectRecord,
}) => {
  if (failedResidents.length === 0) {
    return null;
  }

  return (
    <div className="alert-banner">
      <div className="alert-info">
        <span className="alert-badge">⚠️ ATTENTION REQUIRED</span>
        <div>
          <strong>
            {failedResidents.length} Student{failedResidents.length > 1 ? 's' : ''} with Verification Alerts:
          </strong>{' '}
          {failedResidents.map((r, idx) => (
            <span key={r.residentId}>
              {idx > 0 && ', '}
              <strong style={{ color: 'white' }}>{r.name}</strong> (Room {r.roomNumber}, {r.failureAlert?.failureReason || 'Failed verification'})
            </span>
          ))}
        </div>
      </div>
      <div>
        <button
          className="btn btn-danger btn-sm"
          onClick={() => onCorrectRecord(failedResidents[0])}
        >
          Review & Correct
        </button>
      </div>
    </div>
  );
};
