import React from 'react';
import { CurfewSummary } from '../types/index.js';

interface CurfewSummaryCardsProps {
  summary: CurfewSummary;
  onFilterByStatus?: (status: string) => void;
}

export const CurfewSummaryCards: React.FC<CurfewSummaryCardsProps> = ({ summary, onFilterByStatus }) => {
  return (
    <div className="kpi-grid">
      <div className="kpi-card" onClick={() => onFilterByStatus?.('ALL')} style={{ cursor: 'pointer' }}>
        <div className="kpi-title">
          <span>Total Tracked</span>
          <span>👥</span>
        </div>
        <div className="kpi-count kpi-total">{summary.totalTracked}</div>
      </div>

      <div className="kpi-card" onClick={() => onFilterByStatus?.('VERIFIED_INSIDE')} style={{ cursor: 'pointer' }}>
        <div className="kpi-title">
          <span>Verified Inside</span>
          <span>🟢</span>
        </div>
        <div className="kpi-count kpi-inside">{summary.verifiedInside}</div>
      </div>

      <div className="kpi-card" onClick={() => onFilterByStatus?.('VERIFIED_OUTSIDE')} style={{ cursor: 'pointer' }}>
        <div className="kpi-title">
          <span>Verified Outside</span>
          <span>🔵</span>
        </div>
        <div className="kpi-count kpi-outside">{summary.verifiedOutside}</div>
      </div>

      <div className="kpi-card" onClick={() => onFilterByStatus?.('APPROVED_LEAVE')} style={{ cursor: 'pointer' }}>
        <div className="kpi-title">
          <span>On Approved Leave</span>
          <span>🟣</span>
        </div>
        <div className="kpi-count kpi-leave">{summary.approvedLeave}</div>
      </div>

      <div className="kpi-card" onClick={() => onFilterByStatus?.('PENDING_VERIFICATION')} style={{ cursor: 'pointer' }}>
        <div className="kpi-title">
          <span>Pending Verification</span>
          <span>🟡</span>
        </div>
        <div className="kpi-count kpi-pending">{summary.pendingVerification}</div>
      </div>

      <div className="kpi-card" onClick={() => onFilterByStatus?.('VERIFICATION_FAILED')} style={{ cursor: 'pointer' }}>
        <div className="kpi-title">
          <span>Verification Failed / Alerts</span>
          <span>🔴</span>
        </div>
        <div className="kpi-count kpi-failed">{summary.verificationFailed}</div>
      </div>
    </div>
  );
};
