import React from 'react';
import { Stethoscope, User, Globe, Activity, ShieldCheck, LogOut } from 'lucide-react';

export default function Header({ 
  currentUser,
  language, 
  onLanguageChange, 
  onLogout
}) {
  const languages = [
    { code: 'hi', label: 'हिंदी (Hindi)' },
    { code: 'te', label: 'తెలుగు (Telugu)' },
    { code: 'en', label: 'English' },
  ];

  return (
    <header className="kiosk-header">
      <div className="brand-section">
        <div className="brand-icon">
          <Stethoscope size={26} />
        </div>
        <div>
          <div className="brand-subtitle">Ministry of Ayush / AIIA OPD</div>
          <div className="brand-title">MediKiosk Clinical Platform</div>
        </div>
      </div>

      <div className="header-controls">
        {/* Language Selector */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Globe size={18} color="#0284c7" />
          <select 
            className="lang-select"
            value={language}
            onChange={(e) => onLanguageChange(e.target.value)}
          >
            {languages.map(l => (
              <option key={l.code} value={l.code}>{l.label}</option>
            ))}
          </select>
        </div>

        {/* User Account Profile Pill */}
        {currentUser && (
          <div className="session-badge" style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 12px' }}>
            {currentUser.role === 'doctor' ? (
              <Activity size={16} color="var(--primary)" />
            ) : (
              <User size={16} color="var(--primary)" />
            )}
            <div>
              <strong style={{ display: 'block', fontSize: '12px', color: 'var(--primary-dark)' }}>
                {currentUser.full_name || currentUser.username}
              </strong>
              <span style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700 }}>
                {currentUser.role === 'doctor' ? 'OPD Physician' : `Patient (${currentUser.patient_id || currentUser.user_id})`}
              </span>
            </div>
          </div>
        )}

        {/* Logout Button */}
        {currentUser && (
          <button
            type="button"
            className="touch-btn danger"
            style={{ padding: '6px 12px', fontSize: '12px', borderRadius: '6px' }}
            onClick={onLogout}
            title="Log Out"
          >
            <LogOut size={14} />
            Logout
          </button>
        )}
      </div>
    </header>
  );
}
