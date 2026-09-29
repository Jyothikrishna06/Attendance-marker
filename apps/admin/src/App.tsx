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
  // Authentication & Session (starts completely null, zero fake defaults)
  const [session, setSession] = useState<UserSession | null>(null);
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState<string | null>(null);

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

  // Authentic Staff Login
  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loginEmail.trim() || !loginPassword) {
      setLoginError('Please enter both your institutional email and password.');
      return;
    }
    try {
      setLoading(true);
      setLoginError(null);
      const authData = await api.login(loginEmail.trim(), loginPassword);
      if (
        authData.user.role !== 'WARDEN' &&
        authData.user.role !== 'ADMIN' &&
        authData.user.role !== 'SUPER_ADMIN'
      ) {
        throw new Error('Access denied: Staff credentials required to access the Warden Operations Console.');
      }
      setSession({
        userId: authData.user.id,
        name: authData.user.name,
        email: authData.user.email,
        role: authData.user.role,
        accessToken: authData.accessToken,
        refreshToken: authData.refreshToken,
      });
      setLoginPassword('');
      showNotification(`Authenticated as ${authData.user.name} (${authData.user.role})`);
    } catch (err: any) {
      setLoginError(err?.message || 'Authentication failed. Please verify credentials.');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    api.setToken(null);
    setSession(null);
    setLoginEmail('');
    setLoginPassword('');
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
      const data = await api.getAuditLogs();
      setAuditLogs(data);
    } catch (err) {
      console.error('Failed to load audit logs:', err);
    }
  }, []);

  // Refresh All Data
  const refreshAll = useCallback(async () => {
    if (!session) return;
    setLoading(true);
    await Promise.all([loadCurfewPolicy(), loadStatusRoster(), loadLeaves(), loadAuditLogs()]);
    setLoading(false);
  }, [session, loadCurfewPolicy, loadStatusRoster, loadLeaves, loadAuditLogs]);

  useEffect(() => {
    if (session) {
      refreshAll();
    }
  }, [session, refreshAll]);

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
      <Header session={session} onLogout={handleLogout} />

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

      {/* Unauthenticated State: Clean Staff Login Form */}
      {!session ? (
        <main
          className="main-content"
          style={{
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            minHeight: '65vh',
          }}
        >
          <div
            style={{
              maxWidth: '440px',
              width: '100%',
              background: 'var(--bg-card)',
              padding: '2.5rem',
              borderRadius: 'var(--radius-lg)',
              border: '1px solid var(--border)',
              boxShadow: 'var(--shadow-lg)',
            }}
          >
            <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
              <div style={{ fontSize: '2.75rem', marginBottom: '0.5rem' }}>🏛️</div>
              <h2 style={{ fontSize: '1.45rem', fontWeight: 700, color: 'var(--text-main)' }}>
                Staff Portal Login
              </h2>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginTop: '0.35rem' }}>
                Warden, Administrator & Security Operations
              </p>
            </div>

            {loginError && (
              <div
                className="alert-banner"
                style={{
                  marginBottom: '1.25rem',
                  background: 'var(--danger-bg)',
                  borderColor: 'var(--danger-border)',
                  color: 'var(--danger)',
                }}
              >
                {loginError}
              </div>
            )}

            <form onSubmit={handleLoginSubmit}>
              <div style={{ marginBottom: '1.25rem' }}>
                <label
                  style={{
                    display: 'block',
                    fontSize: '0.85rem',
                    fontWeight: 600,
                    marginBottom: '0.4rem',
                    color: 'var(--text-main)',
                  }}
                  htmlFor="staff-email"
                >
                  Institutional Email
                </label>
                <input
                  id="staff-email"
                  type="email"
                  placeholder="Enter staff email"
                  value={loginEmail}
                  onChange={(e) => setLoginEmail(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '0.75rem 1rem',
                    background: 'var(--bg-input)',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius-sm)',
                    color: 'var(--text-main)',
                    fontSize: '0.95rem',
                  }}
                  autoFocus
                  required
                />
              </div>

              <div style={{ marginBottom: '1.75rem' }}>
                <label
                  style={{
                    display: 'block',
                    fontSize: '0.85rem',
                    fontWeight: 600,
                    marginBottom: '0.4rem',
                    color: 'var(--text-main)',
                  }}
                  htmlFor="staff-password"
                >
                  Password
                </label>
                <input
                  id="staff-password"
                  type="password"
                  placeholder="Enter password"
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '0.75rem 1rem',
                    background: 'var(--bg-input)',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius-sm)',
                    color: 'var(--text-main)',
                    fontSize: '0.95rem',
                  }}
                  required
                />
              </div>

              <button
                type="submit"
                className="btn btn-primary"
                style={{
                  width: '100%',
                  padding: '0.85rem',
                  fontSize: '1rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
                disabled={loading}
              >
                {loading ? 'Authenticating...' : 'Sign In to Operations Console'}
              </button>
            </form>
          </div>
        </main>
      ) : (
        <>
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
              <div
                style={{
                  marginLeft: 'auto',
                  alignSelf: 'center',
                  fontSize: '0.8rem',
                  color: 'var(--cyan)',
                }}
              >
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
        </>
      )}
    </div>
  );
};
