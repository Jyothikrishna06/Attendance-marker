import React from 'react';
import { ResidentStatusItem, ResidentStatus } from '../types/index.js';

interface CurfewRosterTableProps {
  roster: ResidentStatusItem[];
  onCorrectRecord?: (resident: ResidentStatusItem) => void;
}

export const CurfewRosterTable: React.FC<CurfewRosterTableProps> = ({ roster }) => {
  const getBadgeClass = (status: ResidentStatus) => {
    switch (status) {
      case 'VERIFIED_INSIDE': return 'badge-inside';
      case 'VERIFIED_OUTSIDE': return 'badge-outside';
      case 'APPROVED_LEAVE': return 'badge-leave';
      case 'PENDING_VERIFICATION': return 'badge-pending';
      case 'VERIFICATION_FAILED': return 'badge-failed';
      default: return 'badge-pending';
    }
  };

  const getStatusIcon = (status: ResidentStatus) => {
    switch (status) {
      case 'VERIFIED_INSIDE': return '🟢';
      case 'VERIFIED_OUTSIDE': return '🔵';
      case 'APPROVED_LEAVE': return '🟣';
      case 'PENDING_VERIFICATION': return '🟡';
      case 'VERIFICATION_FAILED': return '🔴';
      default: return '⚪';
    }
  };

  const formatTimestamp = (iso?: string | null) => {
    if (!iso) return 'Not yet checked-in';
    const date = new Date(iso);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  if (roster.length === 0) {
    return (
      <div className="table-card">
        <div className="empty-state">
          <div style={{ fontSize: '2rem' }}>🔍</div>
          <div className="empty-state-title">No Residents Match Current Filters</div>
          <p>Try adjusting your hostel, floor, room, or search criteria.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="table-card">
      <div className="table-wrapper">
        <table>
          <thead>
            <tr>
              <th>Resident Student</th>
              <th>Hostel / Location</th>
              <th>Bound Device</th>
              <th>Current Status</th>
              <th>Last Seen</th>
              <th>Emergency Contact</th>
              <th>Verification Evidence (Wi-Fi + Biometric)</th>
            </tr>
          </thead>
          <tbody>
            {roster.map((resident) => (
              <tr key={resident.residentId}>
                <td>
                  <div style={{ fontWeight: 600 }}>{resident.name}</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    Roll: {resident.rollNumber} • {resident.email}
                  </div>
                </td>

                <td>
                  <div>{resident.hostelName}</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    Room {resident.roomNumber} (Floor {resident.floor})
                  </div>
                </td>

                <td>
                  {resident.activeDeviceModel ? (
                    <div>
                      <span>📱 {resident.activeDeviceModel}</span>
                    </div>
                  ) : (
                    <span style={{ color: 'var(--text-subtle)', fontSize: '0.8rem' }}>None Bound</span>
                  )}
                </td>

                <td>
                  <span className={`status-badge ${getBadgeClass(resident.currentStatus)}`}>
                    <span>{getStatusIcon(resident.currentStatus)}</span>
                    <span>{resident.currentStatus.replace('_', ' ')}</span>
                  </span>
                  {resident.failureAlert && (
                    <div style={{ fontSize: '0.7rem', color: 'var(--danger)', marginTop: '0.2rem' }}>
                      ⚠️ {resident.failureAlert.failureReason}
                    </div>
                  )}
                  {resident.activeLeave && (
                    <div style={{ fontSize: '0.7rem', color: '#c084fc', marginTop: '0.2rem' }}>
                      Until: {new Date(resident.activeLeave.endTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  )}
                </td>

                <td>
                  <div style={{ fontFamily: 'JetBrains Mono', fontSize: '0.8rem' }}>
                    {formatTimestamp(resident.lastSeen)}
                  </div>
                  {resident.lastEventType && (
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                      Type: {resident.lastEventType}
                    </div>
                  )}
                </td>

                <td>
                  <div style={{ fontSize: '0.8rem' }}>{resident.emergencyContact.name}</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    {resident.emergencyContact.phone}
                  </div>
                </td>

                <td>
                  {resident.currentStatus === 'VERIFIED_INSIDE' ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                      <span style={{ color: '#10b981', fontWeight: 600, fontSize: '0.78rem' }}>
                        📶 Hostel Wi-Fi Verified
                      </span>
                      <span style={{ color: '#06b6d4', fontWeight: 600, fontSize: '0.78rem' }}>
                        🔒 App Biometric Confirmed
                      </span>
                    </div>
                  ) : resident.currentStatus === 'APPROVED_LEAVE' ? (
                    <span style={{ color: '#c084fc', fontWeight: 600, fontSize: '0.78rem' }}>
                      🟣 Official Approved Leave
                    </span>
                  ) : resident.currentStatus === 'VERIFICATION_FAILED' ? (
                    <span style={{ color: 'var(--danger)', fontWeight: 600, fontSize: '0.78rem' }}>
                      ⚠️ Check Failed: {resident.failureAlert?.failureReason || 'Mismatch'}
                    </span>
                  ) : (
                    <span style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>
                      ⏳ Awaiting Wi-Fi + Biometric Scan
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
