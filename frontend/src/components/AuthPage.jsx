import React, { useState } from 'react';
import { Stethoscope, User, Activity, HeartPulse, ShieldCheck, UserPlus, LogIn, AlertCircle, CheckCircle2 } from 'lucide-react';

export default function AuthPage({ onLoginSuccess, currentLanguage, onLanguageChange }) {
  const [role, setRole] = useState('patient'); // 'patient', 'asha', 'doctor'
  const [isRegister, setIsRegister] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [abhaId, setAbhaId] = useState('');
  const [selectedLang, setSelectedLang] = useState(currentLanguage || 'hi');
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    if (!username.trim() || !password.trim()) {
      setErrorMsg('Please enter both username and password.');
      return;
    }

    setIsSubmitting(true);
    const endpoint = isRegister ? '/api/auth/register' : '/api/auth/login';

    try {
      const payload = isRegister 
        ? { username: username.trim(), password: password.trim(), role, full_name: fullName.trim(), abha_id: abhaId.trim() }
        : { username: username.trim(), password: password.trim(), role };

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.detail || 'Authentication failed. Please check credentials.');
      }

      if (isRegister) {
        setSuccessMsg(`Registration successful as ${role.toUpperCase()}! Logging in...`);
        setTimeout(async () => {
          const loginRes = await fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: username.trim(), password: password.trim(), role })
          });
          const loginData = await loginRes.json();
          if (loginRes.ok) {
            if (onLanguageChange) onLanguageChange(selectedLang);
            onLoginSuccess(loginData, selectedLang);
          } else {
            setIsRegister(false);
            setSuccessMsg('Account created. Please log in with your credentials.');
          }
        }, 800);
      } else {
        if (onLanguageChange) onLanguageChange(selectedLang);
        onLoginSuccess(data, selectedLang);
      }
    } catch (err) {
      setErrorMsg(err.message || 'An error occurred during authentication.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const roleTabs = [
    { id: 'patient', label: 'Patient Kiosk', icon: <User size={16} /> },
    { id: 'asha', label: 'ASHA Worker', icon: <HeartPulse size={16} /> },
    { id: 'doctor', label: 'Physician Portal', icon: <Activity size={16} /> }
  ];

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
      padding: '24px'
    }}>
      <div style={{
        width: '100%',
        maxWidth: '520px',
        background: '#ffffff',
        borderRadius: '20px',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
        overflow: 'hidden',
        border: '1px solid #334155'
      }}>
        {/* Card Header */}
        <div style={{
          background: 'linear-gradient(90deg, #0284c7 0%, #0d9488 100%)',
          padding: '28px 24px',
          textAlign: 'center',
          color: '#ffffff'
        }}>
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '56px',
            height: '56px',
            borderRadius: '50%',
            background: 'rgba(255, 255, 255, 0.2)',
            marginBottom: '12px'
          }}>
            <Stethoscope size={32} color="#ffffff" />
          </div>
          <h2 style={{ fontSize: '22px', fontWeight: 800, margin: '0 0 4px 0' }}>
            MediKiosk Rural Platform
          </h2>
          <p style={{ fontSize: '13px', margin: 0, opacity: 0.9 }}>
            Multi-Tier Integrated Public Healthcare Portal
          </p>
        </div>

        {/* 4 Role Selector Tabs */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', borderBottom: '1px solid #e2e8f0', background: '#f8fafc' }}>
          {roleTabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              style={{
                padding: '12px 6px',
                border: 'none',
                background: role === tab.id ? '#ffffff' : 'transparent',
                borderBottom: role === tab.id ? '3px solid #0284c7' : 'none',
                fontWeight: role === tab.id ? 700 : 500,
                color: role === tab.id ? '#0284c7' : '#64748b',
                cursor: 'pointer',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '4px',
                fontSize: '11px'
              }}
              onClick={() => { setRole(tab.id); setErrorMsg(''); setSuccessMsg(''); }}
            >
              {tab.icon}
              <span>{tab.label}</span>
            </button>
          ))}
        </div>

        {/* Auth Body */}
        <div style={{ padding: '24px 28px' }}>
          {/* Toggle Login vs Register */}
          <div style={{
            display: 'flex',
            background: '#f1f5f9',
            borderRadius: '10px',
            padding: '4px',
            marginBottom: '20px'
          }}>
            <button
              type="button"
              style={{
                flex: 1,
                padding: '8px',
                borderRadius: '8px',
                border: 'none',
                background: !isRegister ? '#ffffff' : 'transparent',
                fontWeight: !isRegister ? 700 : 500,
                color: !isRegister ? '#0f172a' : '#64748b',
                boxShadow: !isRegister ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                cursor: 'pointer',
                fontSize: '13px'
              }}
              onClick={() => { setIsRegister(false); setErrorMsg(''); setSuccessMsg(''); }}
            >
              Log In
            </button>
            <button
              type="button"
              style={{
                flex: 1,
                padding: '8px',
                borderRadius: '8px',
                border: 'none',
                background: isRegister ? '#ffffff' : 'transparent',
                fontWeight: isRegister ? 700 : 500,
                color: isRegister ? '#0f172a' : '#64748b',
                boxShadow: isRegister ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                cursor: 'pointer',
                fontSize: '13px'
              }}
              onClick={() => { setIsRegister(true); setErrorMsg(''); setSuccessMsg(''); }}
            >
              New Account
            </button>
          </div>

          {/* Feedback banners */}
          {errorMsg && (
            <div style={{
              background: '#fef2f2',
              color: '#991b1b',
              border: '1px solid #fecaca',
              borderRadius: '8px',
              padding: '10px 14px',
              fontSize: '13px',
              marginBottom: '16px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}>
              <AlertCircle size={16} style={{ flexShrink: 0 }} />
              <div>{errorMsg}</div>
            </div>
          )}

          {successMsg && (
            <div style={{
              background: '#f0fdf4',
              color: '#166534',
              border: '1px solid #bbf7d0',
              borderRadius: '8px',
              padding: '10px 14px',
              fontSize: '13px',
              marginBottom: '16px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}>
              <CheckCircle2 size={16} style={{ flexShrink: 0 }} />
              <div>{successMsg}</div>
            </div>
          )}

          {/* Auth Form */}
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {isRegister && (
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '4px' }}>
                  Full Name:
                </label>
                <input
                  type="text"
                  placeholder={
                    role === 'doctor' ? 'Dr. Rajesh Sharma' :
                    role === 'asha' ? 'Sunita Devi (ASHA Worker)' : 'Ramesh Kumar'
                  }
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    fontSize: '14px',
                    boxSizing: 'border-box'
                  }}
                  required
                />
              </div>
            )}

            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '4px' }}>
                Username:
              </label>
              <input
                type="text"
                placeholder={role === 'patient' ? 'Phone Number or Patient ID' : 'Enter username'}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                style={{
                  width: '100%',
                  padding: '10px 14px',
                  borderRadius: '8px',
                  border: '1px solid #cbd5e1',
                  fontSize: '14px',
                  boxSizing: 'border-box'
                }}
                required
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '4px' }}>
                Preferred Kiosk Language (भाषा चुनें):
              </label>
              <select
                value={selectedLang}
                onChange={(e) => setSelectedLang(e.target.value)}
                style={{
                  width: '100%',
                  padding: '10px 14px',
                  borderRadius: '8px',
                  border: '1px solid #cbd5e1',
                  fontSize: '14px',
                  fontWeight: 600,
                  boxSizing: 'border-box',
                  background: '#ffffff'
                }}
              >
                <option value="en">English (English)</option>
                <option value="hi">हिंदी (Hindi)</option>
                <option value="te">తెలుగు (Telugu)</option>
              </select>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '4px' }}>
                Password:
              </label>
              <input
                type="password"
                placeholder="Enter password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                style={{
                  width: '100%',
                  padding: '10px 14px',
                  borderRadius: '8px',
                  border: '1px solid #cbd5e1',
                  fontSize: '14px',
                  boxSizing: 'border-box'
                }}
                required
              />
            </div>

            {isRegister && role === 'patient' && (
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '4px' }}>
                  ABHA ID (Optional):
                </label>
                <input
                  type="text"
                  placeholder="e.g. 91-4820-9182-3490"
                  value={abhaId}
                  onChange={(e) => setAbhaId(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    fontSize: '14px',
                    boxSizing: 'border-box'
                  }}
                />
              </div>
            )}

            <button
              type="submit"
              disabled={isSubmitting}
              style={{
                marginTop: '8px',
                padding: '12px',
                borderRadius: '10px',
                border: 'none',
                background: 'linear-gradient(90deg, #0284c7 0%, #0d9488 100%)',
                color: '#ffffff',
                fontWeight: 700,
                fontSize: '15px',
                cursor: isSubmitting ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                opacity: isSubmitting ? 0.7 : 1
              }}
            >
              {isRegister ? <UserPlus size={18} /> : <LogIn size={18} />}
              {isSubmitting 
                ? (isRegister ? 'Creating Account...' : 'Authenticating...') 
                : (isRegister ? `Register as ${role.toUpperCase()}` : `Log In as ${role.toUpperCase()}`)
              }
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
