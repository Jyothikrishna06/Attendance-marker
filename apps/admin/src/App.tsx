import React, { useState, useEffect, useCallback } from 'react';
import './styles/dashboard.css';
import { api } from './services/api.js';
import {
  UserSession,
  CurrentCurfewPolicy,
  CurfewSummary,
  ResidentStatusItem,
  LeaveRequest,
  AuditLogItem,
  FilterState,
  ResidentStatus,
} from './types/index.js';

import { Header } from './components/Header.js';
import { CurfewStatusCard } from './components/CurfewStatusCard.js';
import { CurfewSummaryCards } from './components/CurfewSummaryCards.js';
import { FilterBar } from './components/FilterBar.js';
import { VerificationFailureAlerts } from './components/VerificationFailureAlerts.js';
import { CurfewRosterTable } from './components/CurfewRosterTable.js';
import { RecordCorrectionModal } from './components/RecordCorrectionModal.js';
import { LeaveApprovalQueue } from './components/LeaveApprovalQueue.js';
import { AuditLogViewer } from './components/AuditLogViewer.js';

export const App: React.FC = () => {
  // Authentication & Session
  const [session, setSession] = useState<UserSession | null>({
    userId: 'c0000000-0000-0000-0000-000000000002',
    name: 'Rajesh Sharma',
    email: 'warden.sharma@hostel.edu',
    role: 'WARDEN',
    accessToken: '',
    refreshToken: '',
  });

  // UI State
  const [activeTab, setActiveTab] = useState<'ROSTER' | 'LEAVE' | 'AUDIT'>('ROSTER');
  const [loading, setLoading] = useState(false);
  const [notification, setNotification] = useState<string | null>(null);

  // Data State
  const [curfewPolicy, setCurfewPolicy] = useState<CurrentCurfewPolicy | null>(null);
  const [curfewSummary, setCurfewSummary] = useState<CurfewSummary>({
    totalTracked: 0,
    verifiedInside: 0,
    verifiedOutside: 0,
    approvedLeave: 0,
    pendingVerification: 0,
    verificationFailed: 0,
  });
  const [roster, setRoster] = useState<ResidentStatusItem[]>([]);
  const [leaves, setLeaves] = useState<LeaveRequest[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogItem[]>([]);
  const [selectedAuditEntity, setSelectedAuditEntity] = useState<string>('ALL');

  // Modal State
  const [correctingResident, setCorrectingResident] = useState<ResidentStatusItem | null>(null);

  // Filters
  const [filters, setFilters] = useState<FilterState>({
    hostelId: 'ALL',
    floor: 'ALL',
    roomSearch: '',
    status: 'ALL',
    searchTerm: '',
  });

  const showNotification = (msg: string) => {
    setNotification(msg);
    setTimeout(() => setNotification(null), 4000);
  };

  // Switch demo user
  const handleSwitchUser = async (role: 'WARDEN' | 'ADMIN' | 'RESIDENT') => {
    try {
      setLoading(true);
      let creds = { email: 'warden.sharma@hostel.edu', password: 'WardenSecurePass!2026' };
      if (role === 'ADMIN') {
        creds = { email: 'admin@campus.edu', password: 'AdminSecurePass!2026' };
      } else if (role === 'RESIDENT') {
        creds = { email: 'aarav.patel@student.edu', password: 'ResidentAaravPass!2026' };
      }

      const authData = await api.login(creds.email, creds.password);
      setSession({
        userId: authData.user.id,
        name: authData.user.name,
        email: authData.user.email,
        role: authData.user.role,
        accessToken: authData.accessToken,
        refreshToken: authData.refreshToken,
      });
      showNotification(`Switched session to ${authData.user.name} (${authData.user.role})`);
    } catch (err: any) {
      showNotification(`Login failed: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    api.setToken(null);
    setSession(null);
    showNotification('Logged out successfully.');
  };

  // Load Curfew Policy
  const loadCurfewPolicy = useCallback(async () => {
    try {
      const data = await api.getCurrentCurfew();
      setCurfewPolicy(data);
    } catch (err) {
      console.error('Failed to load curfew policy:', err);
    }
  }, []);

  // Load Roster and Summary
  const loadStatusRoster = useCallback(async () => {
    try {
      const data = await api.getCurfewStatus(filters);
      setCurfewSummary(data.summary);
      setRoster(data.roster);
    } catch (err) {
      console.error('Failed to load status roster:', err);
    }
  }, [filters]);

  // Load Leaves
  const loadLeaves = useCallback(async () => {
    try {
      const data = await api.getLeaveRequests();
      setLeaves(data);
    } catch (err) {
      console.error('Failed to load leave requests:', err);
    }
  }, []);

  // Load Audit Logs
  const loadAuditLogs = useCallback(async () => {
    try {
      const data = await api.getAuditLogs(selectedAuditEntity);
      setAuditLogs(data);
    } catch (err) {
      console.error('Failed to load audit logs:', err);
    }
  }, [selectedAuditEntity]);

  // Refresh all
  const refreshAll = useCallback(async () => {
    setLoading(true);
    await Promise.all([loadCurfewPolicy(), loadStatusRoster(), loadLeaves(), loadAuditLogs()]);
    setLoading(false);
  }, [loadCurfewPolicy, loadStatusRoster, loadLeaves, loadAuditLogs]);

  useEffect(() => {
    refreshAll();
  }, [refreshAll]);

  // Action: Curfew Rule Amendment
  const handleUpdateCurfewPolicy = async (
    ruleId: string,
    curfewTime: string,
    graceMinutes: number,
    justification: string
  ) => {
    await api.updateCurfewRule(ruleId, {
      curfewTime,
      gracePeriodMinutes: graceMinutes,
      justification,
    });
    showNotification('Curfew policy updated successfully and audit log committed.');
    await refreshAll();
  };

  // Action: Leave Adjudication
  const handleAdjudicateLeave = async (
    leaveId: string,
    status: 'APPROVED' | 'REJECTED',
    decisionReason: string
  ) => {
    await api.adjudicateLeave(leaveId, status, decisionReason);
    showNotification(`Leave request ${status.toLowerCase()} successfully.`);
    await refreshAll();
  };

  // Action: Record Correction
  const handleRecordCorrection = async (
    residentId: string,
    newStatus: ResidentStatus,
    reason: string
  ) => {
    await api.correctPresenceRecord({
      residentId,
      status: newStatus,
      reason,
    });
    showNotification('Presence record corrected transactionally with immutable audit entry.');
    await refreshAll();
  };

  // Filtered Roster for UI Search
  const filteredRoster = roster.filter((r) => {
    if (!filters.searchTerm) return true;
    const term = filters.searchTerm.toLowerCase();
    return (
      r.name.toLowerCase().includes(term) ||
      r.rollNumber.toLowerCase().includes(term) ||
      r.roomNumber.toLowerCase().includes(term) ||
      r.email.toLowerCase().includes(term)
    );
  });

  const failedResidents = roster.filter((r) => r.currentStatus === 'VERIFICATION_FAILED');
  const pendingLeavesCount = leaves.filter((l) => l.status === 'PENDING').length;

  return (
    <div className="dashboard-container">
      <Header session={session} onLogout={handleLogout} onSwitchUser={handleSwitchUser} />

      {/* Global Toast Notification */}
      {notification && (
        <div
          style={{
            position: 'fixed',
            top: '70px',
            right: '24px',
            zIndex: 100,
            background: 'var(--success-bg)',
            border: '1px solid var(--success)',
            color: 'var(--success)',
            padding: '0.75rem 1.25rem',
            borderRadius: '8px',
            boxShadow: 'var(--shadow-lg)',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            fontWeight: 500,
          }}
        >
          <span>✓</span>
          <span>{notification}</span>
        </div>
      )}

      {/* Nav Tabs */}
      <nav className="nav-tabs">
        <button
          className={`nav-tab ${activeTab === 'ROSTER' ? 'active' : ''}`}
          onClick={() => setActiveTab('ROSTER')}
        >
          <span>👥 Presence Roster</span>
        </button>

        <button
          className={`nav-tab ${activeTab === 'LEAVE' ? 'active' : ''}`}
          onClick={() => setActiveTab('LEAVE')}
        >
          <span>📋 Leave Approval Queue</span>
          {pendingLeavesCount > 0 && <span className="nav-badge">{pendingLeavesCount}</span>}
        </button>

        <button
          className={`nav-tab ${activeTab === 'AUDIT' ? 'active' : ''}`}
          onClick={() => setActiveTab('AUDIT')}
        >
          <span>🔒 Immutable Audit Logs</span>
        </button>

        {loading && (
          <div style={{ marginLeft: 'auto', alignSelf: 'center', fontSize: '0.8rem', color: 'var(--cyan)' }}>
            🔄 Syncing operational feed...
          </div>
        )}
      </nav>

      {/* Main Body */}
      <main className="main-content">
        {/* Curfew Policy Overview */}
        <CurfewStatusCard policy={curfewPolicy} onUpdatePolicy={handleUpdateCurfewPolicy} />

        {activeTab === 'ROSTER' && (
          <>
            {/* KPI Cards */}
            <CurfewSummaryCards
              summary={curfewSummary}
              onFilterByStatus={(status) => setFilters({ ...filters, status })}
            />

            {/* Failure Alerts Banner */}
            <VerificationFailureAlerts
              failedResidents={failedResidents}
              onCorrectRecord={(res) => setCorrectingResident(res)}
            />

            {/* Filters Bar */}
            <FilterBar
              filters={filters}
              onFilterChange={(newF) => setFilters({ ...filters, ...newF })}
              onReset={() =>
                setFilters({
                  hostelId: 'ALL',
                  floor: 'ALL',
                  roomSearch: '',
                  status: 'ALL',
                  searchTerm: '',
                })
              }
            />

            {/* Live Table */}
            <CurfewRosterTable
              roster={filteredRoster}
              onCorrectRecord={(res) => setCorrectingResident(res)}
            />
          </>
        )}

        {activeTab === 'LEAVE' && (
          <LeaveApprovalQueue leaves={leaves} onAdjudicate={handleAdjudicateLeave} />
        )}

        {activeTab === 'AUDIT' && (
          <AuditLogViewer
            logs={auditLogs}
            selectedEntity={selectedAuditEntity}
            onEntityChange={(entity) => setSelectedAuditEntity(entity)}
          />
        )}
      </main>

      {/* Record Correction Modal */}
      {correctingResident && (
        <RecordCorrectionModal
          resident={correctingResident}
          onClose={() => setCorrectingResident(null)}
          onSubmit={handleRecordCorrection}
        />
      )}
    </div>
  );
};
