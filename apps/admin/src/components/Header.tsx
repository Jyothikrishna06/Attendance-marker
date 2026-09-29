import React, { useState, useEffect } from 'react';
import { UserSession } from '../types/index.js';

interface HeaderProps {
  session: UserSession | null;
  onLogout: () => void;
  onSwitchUser: (role: 'WARDEN' | 'ADMIN' | 'RESIDENT') => void;
}

export const Header: React.FC<HeaderProps> = ({ session, onLogout, onSwitchUser }) => {
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const getRoleClass = (role?: string) => {
    switch (role) {
      case 'SUPER_ADMIN': return 'role-super';
      case 'ADMIN': return 'role-admin';
      case 'WARDEN': return 'role-warden';
      default: return 'role-warden';
    }
  };

  return (
    <header className="header">
      <div className="header-brand">
        <div className="header-brand-icon">🏛️</div>
        <div>
          <h1 className="header-title">Campus Presence & Curfew Control</h1>
          <div className="header-subtitle">Hostel Operations & Safety Center</div>
        </div>
      </div>

      <div className="header-actions">
        <div className="time-display">
          📅 {currentTime.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })} • {currentTime.toLocaleTimeString()}
        </div>

        {session ? (
          <div className="user-badge">
            <span>👤 {session.name}</span>
            <span className={`role-pill ${getRoleClass(session.role)}`}>
              {session.role}
            </span>
            <button className="btn btn-secondary btn-sm" onClick={onLogout} title="Log out current staff session">
              Logout
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button className="btn btn-primary btn-sm" onClick={() => onSwitchUser('WARDEN')}>
              Demo Login: Warden
            </button>
            <button className="btn btn-secondary btn-sm" onClick={() => onSwitchUser('ADMIN')}>
              Demo Login: Admin
            </button>
          </div>
        )}
      </div>
    </header>
  );
};
