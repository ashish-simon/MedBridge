import React from 'react';
import { Stethoscope, Globe, LogOut, User, Activity, ShieldCheck, HeartPulse } from 'lucide-react';

export default function Header({ currentUser, language, onLanguageChange, onLogout }) {
  const getRoleBadge = (role) => {
    switch (role) {
      case 'asha':
        return { label: 'ASHA Health Worker', bg: '#ecfdf5', color: '#047857', icon: <HeartPulse size={14} /> };
      case 'doctor':
        return { label: 'Physician / Specialist', bg: '#f0f9ff', color: '#0369a1', icon: <Activity size={14} /> };
      case 'admin':
        return { label: 'System Admin', bg: '#fef3c7', color: '#b45309', icon: <ShieldCheck size={14} /> };
      default:
        return { label: 'Patient Kiosk', bg: '#f3e8ff', color: '#6b21a8', icon: <User size={14} /> };
    }
  };

  const badge = getRoleBadge(currentUser?.role);

  return (
    <header className="kiosk-header">
      {/* Brand Logo & Title */}
      <div className="brand-section">
        <div className="brand-icon">
          <Stethoscope size={24} color="#ffffff" />
        </div>
        <div>
          <div className="brand-title">MediKiosk Platform</div>
          <div className="brand-subtitle">Ministry of Ayush / AIIA Rural Healthcare Continuum</div>
        </div>
      </div>

      {/* User Status & Language Control */}
      <div className="header-controls">
        {/* User Info Badge */}
        {currentUser && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            background: badge.bg,
            color: badge.color,
            padding: '6px 14px',
            borderRadius: '20px',
            fontWeight: 700,
            fontSize: '13px',
            border: `1px solid ${badge.color}33`
          }}>
            {badge.icon}
            <span>{currentUser.full_name || currentUser.username}</span>
            <span style={{ opacity: 0.6, fontSize: '11px' }}>({badge.label})</span>
          </div>
        )}

        {/* Global Language Selector (Strictly English, Hindi, Telugu) */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Globe size={18} color="var(--primary)" />
          <select
            className="lang-select"
            value={language}
            onChange={(e) => {
              onLanguageChange(e.target.value);
            }}
          >
            <option value="en">English (English)</option>
            <option value="hi">हिन्दी (Hindi)</option>
            <option value="te">తెలుగు (Telugu)</option>
          </select>
        </div>

        {/* Logout Button */}
        {currentUser && (
          <button
            onClick={onLogout}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 14px',
              borderRadius: '20px',
              border: '1px solid var(--border-color)',
              background: '#ffffff',
              color: '#dc2626',
              fontSize: '13px',
              fontWeight: 700,
              cursor: 'pointer'
            }}
          >
            <LogOut size={16} />
            <span>Logout</span>
          </button>
        )}
      </div>
    </header>
  );
}
