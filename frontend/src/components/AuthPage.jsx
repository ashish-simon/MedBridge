import React, { useState } from 'react';
import { Stethoscope, User, Activity, Lock, UserPlus, LogIn, AlertCircle, ShieldCheck, CheckCircle2 } from 'lucide-react';

export default function AuthPage({ onLoginSuccess }) {
  const [role, setRole] = useState('patient'); // 'patient' or 'doctor'
  const [isRegister, setIsRegister] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [abhaId, setAbhaId] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    if (!username.trim() || !password.strip ? !password.trim() : !password) {
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
        setSuccessMsg(`Registration successful as ${role.toUpperCase()}! Automatically logging in...`);
        setTimeout(async () => {
          // Auto-login after registration
          const loginRes = await fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: username.trim(), password: password.trim(), role })
          });
          const loginData = await loginRes.json();
          if (loginRes.ok) {
            onLoginSuccess(loginData);
          } else {
            setIsRegister(false);
            setSuccessMsg('Account created. Please log in with your credentials.');
          }
        }, 1000);
      } else {
        onLoginSuccess(data);
      }
    } catch (err) {
      setErrorMsg(err.message || 'An error occurred during authentication.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%)',
      padding: '24px'
    }}>
      <div style={{
        width: '100%',
        maxWidth: '460px',
        background: '#ffffff',
        borderRadius: '16px',
        boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
        border: '1px solid #bae6fd',
        overflow: 'hidden'
      }}>
        {/* Card Header */}
        <div style={{
          background: 'linear-gradient(90deg, #0284c7 0%, #0369a1 100%)',
          padding: '28px 24px',
          textAlign: 'center',
          color: '#ffffff'
        }}>
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '54px',
            height: '54px',
            borderRadius: '50%',
            background: 'rgba(255, 255, 255, 0.2)',
            marginBottom: '12px'
          }}>
            <Stethoscope size={30} color="#ffffff" />
          </div>
          <h2 style={{ fontSize: '22px', fontWeight: 800, margin: '0 0 4px 0', letterSpacing: '-0.5px' }}>
            MediKiosk Auth Portal
          </h2>
          <p style={{ fontSize: '13px', margin: 0, opacity: 0.9 }}>
            Ministry of Ayush / AIIA OPD Clinical System
          </p>
        </div>

        {/* Role Selector Tabs */}
        <div style={{ display: 'flex', borderBottom: '1px solid #e2e8f0' }}>
          <button
            type="button"
            style={{
              flex: 1,
              padding: '14px',
              border: 'none',
              background: role === 'patient' ? '#ffffff' : '#f8fafc',
              borderBottom: role === 'patient' ? '3px solid #0284c7' : 'none',
              fontWeight: role === 'patient' ? 700 : 500,
              color: role === 'patient' ? '#0284c7' : '#64748b',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              fontSize: '14px'
            }}
            onClick={() => { setRole('patient'); setErrorMsg(''); setSuccessMsg(''); }}
          >
            <User size={18} />
            Patient Kiosk Login
          </button>

          <button
            type="button"
            style={{
              flex: 1,
              padding: '14px',
              border: 'none',
              background: role === 'doctor' ? '#ffffff' : '#f8fafc',
              borderBottom: role === 'doctor' ? '3px solid #0284c7' : 'none',
              fontWeight: role === 'doctor' ? 700 : 500,
              color: role === 'doctor' ? '#0284c7' : '#64748b',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              fontSize: '14px'
            }}
            onClick={() => { setRole('doctor'); setErrorMsg(''); setSuccessMsg(''); }}
          >
            <Activity size={18} />
            Physician Dashboard
          </button>
        </div>

        {/* Auth Mode Toggle (Login vs Register) */}
        <div style={{ padding: '24px 28px' }}>
          <div style={{
            display: 'flex',
            background: '#f1f5f9',
            borderRadius: '8px',
            padding: '4px',
            marginBottom: '20px'
          }}>
            <button
              type="button"
              style={{
                flex: 1,
                padding: '8px',
                borderRadius: '6px',
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
                borderRadius: '6px',
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
              New Registration
            </button>
          </div>

          {/* Error and Success Alerts */}
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

          {/* Login / Registration Form */}
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {isRegister && (
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '4px' }}>
                  Full Name:
                </label>
                <input
                  type="text"
                  placeholder={role === 'doctor' ? 'e.g. Dr. Rajesh Sharma' : 'e.g. Ramesh Kumar'}
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
                placeholder={role === 'doctor' ? 'Doctor Username' : 'Patient Phone / ID'}
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
                borderRadius: '8px',
                border: 'none',
                background: 'linear-gradient(90deg, #0284c7 0%, #0369a1 100%)',
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
                ? (isRegister ? 'Creating Account...' : 'Logging in...') 
                : (isRegister ? `Register as ${role === 'doctor' ? 'Physician' : 'Patient'}` : `Log In as ${role === 'doctor' ? 'Physician' : 'Patient'}`)
              }
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
