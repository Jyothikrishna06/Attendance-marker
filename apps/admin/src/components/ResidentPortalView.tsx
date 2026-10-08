import React, { useState, useEffect } from 'react';
import { api } from '../services/api.js';
import { UserSession, CurrentCurfewPolicy } from '../types/index.js';

interface ResidentPortalViewProps {
  session: UserSession;
  curfewPolicy: CurrentCurfewPolicy | null;
  onNotification: (msg: string) => void;
}

export const ResidentPortalView: React.FC<ResidentPortalViewProps> = ({
  session,
  curfewPolicy,
  onNotification,
}) => {
  const [presenceData, setPresenceData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastVerifiedAt, setLastVerifiedAt] = useState<string | null>(null);

  const loadPresence = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await api.getMyPresenceStatus();
      setPresenceData(data);
    } catch (err: any) {
      console.error('Failed to load resident presence:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPresence();
  }, []);

  const handleVerifyPresence = async () => {
    try {
      setVerifying(true);
      setError(null);

      // Step 1: Request authoritative short-lived challenge nonce
      const challenge = await api.generateChallenge();

      // Step 2: Submit verification with biometric confirmation flag
      await api.verifyPresence(
        challenge.challengeId,
        challenge.challengeNonce,
        true
      );

      setLastVerifiedAt(new Date().toLocaleTimeString());
      onNotification('Presence successfully verified! Authoritative server event recorded.');
      await loadPresence();
    } catch (err: any) {
      const msg = err?.message || 'Verification failed. Please check network authorization.';
      setError(msg);
      onNotification(`Verification error: ${msg}`);
    } finally {
      setVerifying(false);
    }
  };

  const handleExit = async () => {
    try {
      setLoading(true);
      setError(null);
      await api.exitPresence();
      onNotification('Exit recorded successfully. Status updated to VERIFIED_OUTSIDE.');
      await loadPresence();
    } catch (err: any) {
      setError(err?.message || 'Failed to record exit');
    } finally {
      setLoading(false);
    }
  };

  const isVerifiedInside =
    presenceData?.currentStatus === 'VERIFIED_INSIDE' ||
    presenceData?.status === 'VERIFIED_INSIDE';

  return (
    <div style={{ maxWidth: '800px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Welcome Card */}
      <div
        style={{
          background: 'var(--bg-card)',
          padding: '1.75rem',
          borderRadius: 'var(--radius-lg)',
          border: '1px solid var(--border)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <div>
          <span style={{ fontSize: '0.8rem', color: 'var(--cyan)', fontWeight: 600, textTransform: 'uppercase' }}>
            Resident Student Portal
          </span>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 700, marginTop: '0.25rem' }}>
            Welcome, {session.name}
          </h2>
          <div style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginTop: '0.2rem' }}>
            Email: {session.email}
          </div>
        </div>

        <div style={{ textAlign: 'right' }}>
          <span
            style={{
              display: 'inline-block',
              padding: '0.4rem 0.85rem',
              borderRadius: '9999px',
              fontSize: '0.85rem',
              fontWeight: 700,
              background: isVerifiedInside ? 'var(--success-bg)' : 'var(--warning-bg)',
              color: isVerifiedInside ? 'var(--success)' : 'var(--warning)',
              border: `1px solid ${isVerifiedInside ? 'var(--success-border)' : 'var(--warning-border)'}`,
            }}
          >
            {isVerifiedInside ? '● VERIFIED INSIDE' : '○ PENDING CHECK-IN'}
          </span>
          {lastVerifiedAt && (
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.35rem' }}>
              Last Verified: {lastVerifiedAt}
            </div>
          )}
        </div>
      </div>

      {error && (
        <div
          className="alert-banner"
          style={{
            background: 'var(--danger-bg)',
            borderColor: 'var(--danger-border)',
            color: 'var(--danger)',
          }}
        >
          ⚠️ {error}
        </div>
      )}

      {/* Verification Action Card */}
      <div
        style={{
          background: 'var(--bg-card)',
          padding: '2rem',
          borderRadius: 'var(--radius-lg)',
          border: '1px solid var(--border)',
          textAlign: 'center',
        }}
      >
        <h3 style={{ fontSize: '1.3rem', fontWeight: 700 }}>Curfew Presence Attestation</h3>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', maxWidth: '520px', margin: '0.5rem auto 1.25rem' }}>
          Submit your presence verification before the curfew deadline. This operation generates a 32-byte 
          cryptographic challenge and validates institutional campus Wi-Fi network and biometric signals.
        </p>

        {/* Network & Hardware Verification Details */}
        <div
          style={{
            background: '#09101d',
            border: '1px solid var(--border)',
            borderRadius: '8px',
            padding: '1rem',
            maxWidth: '560px',
            margin: '0 auto 1.5rem',
            textAlign: 'left',
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: '0.75rem',
            fontSize: '0.825rem',
          }}
        >
          <div>
            <span style={{ color: 'var(--text-muted)' }}>📶 Authorized Network:</span>
            <div style={{ color: 'var(--cyan)', fontWeight: 600, marginTop: '2px' }}>
              Authorized Hotspot / Wi-Fi
            </div>
          </div>
          <div>
            <span style={{ color: 'var(--text-muted)' }}>🔒 Hardware Binding:</span>
            <div style={{ color: '#a78bfa', fontWeight: 600, marginTop: '2px' }}>
              {presenceData?.activeDevice?.deviceModel || 'Approved Hardware Device'}
            </div>
          </div>
          <div>
            <span style={{ color: 'var(--text-muted)' }}>🛡️ Anti-Replay Nonce:</span>
            <div style={{ color: 'var(--success)', fontWeight: 600, marginTop: '2px' }}>
              SHA-256 (60s Server TTL)
            </div>
          </div>
          <div>
            <span style={{ color: 'var(--text-muted)' }}>🌐 Gateway Enforcement:</span>
            <div style={{ color: 'var(--warning)', fontWeight: 600, marginTop: '2px' }}>
              Restricted to Campus Subnet
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'center', gap: '1rem', flexWrap: 'wrap' }}>
          <button
            className="btn btn-primary"
            style={{ padding: '0.85rem 1.75rem', fontSize: '1rem', fontWeight: 600 }}
            onClick={handleVerifyPresence}
            disabled={verifying || loading}
          >
            {verifying ? 'Verifying Challenge & Biometrics...' : '✓ Verify Presence Now'}
          </button>

          {isVerifiedInside && (
            <button
              className="btn btn-secondary"
              style={{ padding: '0.85rem 1.5rem', fontSize: '1rem' }}
              onClick={handleExit}
              disabled={loading}
            >
              Log Hostel Exit
            </button>
          )}

          <button
            className="btn btn-secondary"
            style={{ padding: '0.85rem 1rem' }}
            onClick={loadPresence}
            disabled={loading}
            title="Refresh status"
          >
            🔄
          </button>
        </div>
      </div>

      {/* Curfew Rules Reference */}
      {curfewPolicy && (
        <div
          style={{
            background: 'var(--bg-card)',
            padding: '1.5rem',
            borderRadius: 'var(--radius-lg)',
            border: '1px solid var(--border)',
          }}
        >
          <h4 style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text-main)', marginBottom: '0.75rem' }}>
            🌙 Active Curfew Policy ({curfewPolicy.hostelName})
          </h4>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem' }}>
            <div style={{ background: '#0f172a', padding: '0.85rem', borderRadius: '8px' }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Curfew Deadline</div>
              <div style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--cyan)' }}>
                {curfewPolicy.curfewTime}
              </div>
            </div>
            <div style={{ background: '#0f172a', padding: '0.85rem', borderRadius: '8px' }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Grace Window</div>
              <div style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--warning)' }}>
                {curfewPolicy.gracePeriodMinutes} Minutes
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
