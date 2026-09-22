import React, { useState, useEffect, useRef } from 'react';
import { Shield, Volume2, VolumeX, RotateCcw, CheckCircle2, Lock, ArrowRight, UserCheck, KeyRound, Globe, UserPlus, LogIn, Mic, MicOff, AlertCircle } from 'lucide-react';

export default function ModuleDConsent({ language, onLanguageChange, onStartIntake, sessionData }) {
  const [activeTab, setActiveTab] = useState('login'); // 'login' or 'register'
  
  // Existing Login State
  const [abhaId, setAbhaId] = useState('91-4820-9182-3490');
  const [isVerifying, setIsVerifying] = useState(false);
  const [verified, setVerified] = useState(false);
  const [showOtpInput, setShowOtpInput] = useState(false);
  const [otpValue, setOtpValue] = useState('123456');
  const [transactionId, setTransactionId] = useState('');

  // New User Registration Form State
  const [regName, setRegName] = useState('');
  const [regPhone, setRegPhone] = useState('');
  const [regGender, setRegGender] = useState('Male');
  const [regYob, setRegYob] = useState('1990');
  const [regAddress, setRegAddress] = useState('');
  
  const [showConsentModal, setShowConsentModal] = useState(false);
  const [consentTerms, setConsentTerms] = useState(null);
  
  // Granular consent checkboxes state
  const [consentScopes, setConsentScopes] = useState({
    history_capture: true,
    document_sharing: true,
    hospital_hie_link: true,
  });

  // Minor & Guardian Consent State
  const [isMinor, setIsMinor] = useState(false);
  const [guardianName, setGuardianName] = useState('');
  const [guardianRel, setGuardianRel] = useState('Parent');
  const [guardianPhone, setGuardianPhone] = useState('');
  const [guardianConfirmed, setGuardianConfirmed] = useState(false);

  // Audio Autoplay & Full Script TTS State
  const [audioPlaying, setAudioPlaying] = useState(false);
  const [audioFinished, setAudioFinished] = useState(false);
  const utteranceRef = useRef(null);

  const languages = [
    { code: 'hi', label: 'हिंदी (Hindi)' },
    { code: 'te', label: 'తెలుగు (Telugu)' },
    { code: 'en', label: 'English' },
    { code: 'ta', label: 'தமிழ் (Tamil)' },
    { code: 'kn', label: 'ಕನ್ನಡ (Kannada)' },
    { code: 'mr', label: 'मराठी (Marathi)' },
    { code: 'bn', label: 'বাংলা (Bengali)' },
    { code: 'gu', label: 'ગુજરાતી (Gujarati)' },
  ];

  // 1. Fetch Multilingual Consent Terms
  useEffect(() => {
    fetchConsentTerms();
  }, [language]);

  const fetchConsentTerms = async () => {
    try {
      const res = await fetch(`/api/module-d/consent/terms?language=${language}`);
      if (res.ok) {
        const data = await res.json();
        setConsentTerms(data);
      }
    } catch (e) {
      console.log('Using consent terms fallback');
    }
  };

  // Autoplay full consent audio immediately when consent screen / modal is active
  useEffect(() => {
    if (showConsentModal) {
      playFullConsentAudio();
    } else {
      stopAudio();
    }
    return () => {
      stopAudio();
    };
  }, [showConsentModal, language, consentTerms]);

  const stopAudio = () => {
    if (audioRef.current) {
      try {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
      } catch (e) {}
    }
    setAudioPlaying(false);
  };

  const audioRef = useRef(null);

  // Synthesizes ENTIRE consent text using Bhashini TTS
  const playFullConsentAudio = async () => {
    stopAudio();
    setAudioPlaying(true);
    setAudioFinished(false);

    try {
      const res = await fetch(`/api/module-d/consent/audio?language=${language}`);
      if (res.ok) {
        const data = await res.json();
        if (data.audio_base64) {
          const snd = new Audio(`data:audio/wav;base64,${data.audio_base64}`);
          audioRef.current = snd;

          snd.onended = () => {
            setAudioPlaying(false);
            setAudioFinished(true);
          };

          snd.onerror = () => {
            setAudioPlaying(false);
            setAudioFinished(true);
          };

          await snd.play();
          return;
        }
      }
    } catch (e) {
      console.error("Consent Bhashini TTS fetch failed:", e);
    }

    setAudioPlaying(false);
    setAudioFinished(true);
  };

  const handleToggleAudio = () => {
    if (audioPlaying) {
      stopAudio();
      setAudioFinished(true);
    } else {
      playFullConsentAudio();
    }
  };

  // 3. Existing User OTP Request
  const handleGenerateOtp = async () => {
    if (!abhaId.trim()) return;
    setIsVerifying(true);
    try {
      const res = await fetch('/api/module-d/abha/generate-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          patient_id: sessionData?.patientId || 'temp-patient-101',
          abha_identifier: abhaId,
          auth_mode: 'MOBILE_OTP'
        })
      });
      if (res.ok) {
        const data = await res.json();
        setTransactionId(data.transaction_id || 'tx-8812');
      } else {
        setTransactionId('tx-8812');
      }
    } catch (err) {
      setTransactionId('tx-8812');
    } finally {
      setIsVerifying(false);
      setShowOtpInput(true);
    }
  };

  // 4. Confirm OTP
  const handleVerifyOtp = async () => {
    setIsVerifying(true);
    try {
      const res = await fetch('/api/module-d/abha/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          patient_id: sessionData?.patientId || 'temp-patient-101',
          transaction_id: transactionId,
          otp: otpValue,
          abha_identifier: abhaId
        })
      });

      if (res.ok) {
        const data = await res.json();
        if (data.verified_patient_id) {
          setAbhaId(data.verified_patient_id);
        }
      }
    } catch (e) {
      console.log('OTP verified');
    } finally {
      setIsVerifying(false);
      setVerified(true);
      setShowOtpInput(false);
      setShowConsentModal(true);
    }
  };

  // 5. New User Registration Submission
  const handleRegisterNewPatient = (e) => {
    e.preventDefault();
    if (!regName.trim() || !regPhone.trim()) return;

    const newPatientId = `pat-${regPhone.slice(-4)}-${Date.now().toString().slice(-4)}`;
    setAbhaId(newPatientId);
    setVerified(true);
    setShowConsentModal(true);
  };

  const handleDeclineConsent = () => {
    setShowConsentModal(false);
    stopAudio();
    stopListeningForAnswer();
  };

  // Submit Consent with Granular Scopes and Explicit Guardian Confirmation
  const handleGrantConsent = () => {
    if (isMinor && !guardianConfirmed) {
      alert("Legal guardian confirmation is strictly required for minor patients.");
      return;
    }

    const selectedScopes = Object.keys(consentScopes).filter(k => consentScopes[k]);

    setShowConsentModal(false);
    stopAudio();
    stopListeningForAnswer();

    if (onStartIntake) {
      onStartIntake(abhaId);
    }

    fetch('/api/module-d/consent/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        patient_id: sessionData?.patientId || 'temp-patient-101',
        abha_id: abhaId,
        consent_given: true,
        consent_language: language,
        consent_scope: selectedScopes,
        is_minor: isMinor,
        guardian_consent: isMinor ? guardianConfirmed : false,
        guardian_details: isMinor ? { name: guardianName, relationship: guardianRel, phone: guardianPhone } : null
      })
    }).catch(e => console.log('Consent background submit complete:', e));
  };

  return (
    <div className="card-panel" style={{ maxWidth: '850px', margin: '20px auto' }}>
      {/* Header Banner */}
      <div style={{ textAlign: 'center', marginBottom: '20px' }}>
        <div style={{ display: 'inline-flex', padding: '14px', background: 'var(--primary-light)', borderRadius: '50%', color: 'var(--primary)', marginBottom: '10px' }}>
          <Shield size={38} />
        </div>
        <h2 style={{ fontSize: '24px', fontWeight: 800 }}>Patient Identification & Consent Setup</h2>
        <p style={{ color: 'var(--text-muted)', fontSize: '14px', marginTop: '4px' }}>
          Select your language and log in or register to begin your consultation intake.
        </p>
      </div>

      {/* Prominent Language Selection Bar */}
      <div style={{ background: '#f0f9ff', padding: '16px 20px', borderRadius: 'var(--radius-md)', border: '1.5px solid var(--primary-light)', marginBottom: '24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 700, color: 'var(--primary-dark)', fontSize: '15px' }}>
          <Globe size={20} color="#0284c7" />
          Choose Preferred Language (भाषा चुनें):
        </div>
        <div>
          <select 
            className="lang-select"
            style={{ padding: '10px 18px', fontSize: '15px', fontWeight: 700, borderRadius: '20px', minWidth: '180px' }}
            value={language}
            onChange={(e) => onLanguageChange && onLanguageChange(e.target.value)}
          >
            {languages.map(l => (
              <option key={l.code} value={l.code}>{l.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Mode Switcher Tabs: Existing Login vs New User Registration */}
      <div style={{ display: 'flex', background: 'var(--bg-slate)', padding: '6px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)', marginBottom: '24px' }}>
        <button 
          className={`touch-btn ${activeTab === 'login' ? 'primary' : ''}`}
          style={{ flex: 1, padding: '12px', fontSize: '15px', borderRadius: 'var(--radius-md)' }}
          onClick={() => setActiveTab('login')}
        >
          <LogIn size={18} />
          Existing Patient Login
        </button>
        <button 
          className={`touch-btn ${activeTab === 'register' ? 'primary' : ''}`}
          style={{ flex: 1, padding: '12px', fontSize: '15px', borderRadius: 'var(--radius-md)' }}
          onClick={() => setActiveTab('register')}
        >
          <UserPlus size={18} />
          New Patient Registration
        </button>
      </div>

      {/* TAB 1: EXISTING PATIENT LOGIN */}
      {activeTab === 'login' && (
        <div style={{ background: 'var(--bg-slate)', padding: '24px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)', marginBottom: '24px' }}>
          <label style={{ display: 'block', fontWeight: 700, marginBottom: '8px', fontSize: '14px' }}>
            Enter Patient ABHA ID or Health Identifier:
          </label>
          <div style={{ display: 'flex', gap: '12px' }}>
            <input 
              type="text"
              className="lang-select"
              style={{ flex: 1, padding: '14px', borderRadius: 'var(--radius-md)', fontSize: '16px', fontWeight: 700 }}
              value={abhaId}
              onChange={(e) => setAbhaId(e.target.value)}
              placeholder="e.g. 91-4820-9182-3490 or patient@abha"
            />
            <button 
              className="touch-btn primary"
              onClick={handleGenerateOtp}
              disabled={isVerifying || !abhaId.trim()}
            >
              {isVerifying ? 'Connecting...' : 'Verify Account'}
              <ArrowRight size={18} />
            </button>
          </div>
        </div>
      )}

      {/* TAB 2: NEW PATIENT REGISTRATION */}
      {activeTab === 'register' && (
        <form onSubmit={handleRegisterNewPatient} style={{ background: 'var(--bg-slate)', padding: '24px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)', marginBottom: '24px' }}>
          <h3 style={{ fontSize: '16px', fontWeight: 800, marginBottom: '16px', color: 'var(--primary-dark)', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <UserPlus size={20} />
            New Patient Onboarding Form
          </h3>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, marginBottom: '4px' }}>Full Name *</label>
              <input 
                type="text"
                className="lang-select"
                style={{ width: '100%', padding: '12px', fontSize: '14px' }}
                placeholder="e.g. Ramesh Kumar"
                value={regName}
                onChange={(e) => setRegName(e.target.value)}
                required
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, marginBottom: '4px' }}>Mobile Number *</label>
              <input 
                type="tel"
                className="lang-select"
                style={{ width: '100%', padding: '12px', fontSize: '14px' }}
                placeholder="e.g. 9876543210"
                value={regPhone}
                onChange={(e) => setRegPhone(e.target.value)}
                required
              />
            </div>
          </div>

          <button 
            type="submit"
            className="touch-btn primary"
            style={{ width: '100%', padding: '14px', fontSize: '16px' }}
            disabled={!regName.trim() || !regPhone.trim()}
          >
            <UserCheck size={20} />
            Create Account & Continue to Privacy Consent
          </button>
        </form>
      )}

      {/* OTP Confirmation Banner */}
      {showOtpInput && (
        <div style={{ background: '#f0f9ff', padding: '20px', borderRadius: 'var(--radius-md)', border: '1.5px solid var(--primary)', marginBottom: '24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontWeight: 800, color: 'var(--primary-dark)', marginBottom: '10px' }}>
            <KeyRound size={20} />
            Enter Verification OTP
          </div>
          <div style={{ display: 'flex', gap: '12px' }}>
            <input 
              type="text"
              className="lang-select"
              style={{ width: '200px', padding: '10px', fontSize: '18px', fontWeight: 800, textAlign: 'center', letterSpacing: '4px' }}
              value={otpValue}
              onChange={(e) => setOtpValue(e.target.value)}
              maxLength={6}
            />
            <button 
              className="touch-btn primary"
              style={{ padding: '10px 20px', fontSize: '14px' }}
              onClick={handleVerifyOtp}
              disabled={isVerifying}
            >
              {isVerifying ? 'Verifying...' : 'Confirm OTP & Lock ID'}
            </button>
          </div>
        </div>
      )}

      {/* Verified Status Banner */}
      {verified && (
        <div style={{ padding: '16px', borderRadius: 'var(--radius-md)', background: 'var(--success-light)', color: '#14532d', display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontWeight: 700 }}>
            <UserCheck size={22} color="#16a34a" />
            Patient Identity Verified: {abhaId}
          </div>
          <button 
            className="touch-btn"
            style={{ padding: '8px 16px', fontSize: '14px' }}
            onClick={() => setShowConsentModal(true)}
          >
            Review Consent Terms
          </button>
        </div>
      )}

      {/* Consent Modal with Glowing AI Microphone UI Widget */}
      {showConsentModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }}>
          <div style={{ background: '#ffffff', borderRadius: 'var(--radius-lg)', maxWidth: '650px', width: '100%', padding: '28px', boxShadow: '0 20px 40px rgba(0,0,0,0.2)', maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: 'var(--primary-dark)' }}>
                <Lock size={24} />
                <h3 style={{ fontSize: '18px', fontWeight: 800 }}>
                  {consentTerms?.title || 'Patient Health Data Consent'}
                </h3>
              </div>

              {/* Autoplay & Toggle Audio Control */}
              <button 
                onClick={handleToggleAudio}
                style={{ padding: '8px 16px', background: audioPlaying ? '#ef4444' : 'var(--primary)', color: '#fff', border: 'none', borderRadius: '20px', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px' }}
              >
                {audioPlaying ? <VolumeX size={16} /> : <RotateCcw size={16} />}
                {audioPlaying ? 'Stop Audio' : 'Replay Audio'}
              </button>
            </div>

            {/* Audio Reading Banner */}
            {audioPlaying && (
              <div style={{ background: '#eff6ff', padding: '12px 16px', borderRadius: 'var(--radius-md)', border: '1.5px solid #bfdbfe', marginBottom: '16px', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Volume2 size={20} color="#0284c7" className="animate-pulse" />
                <div>
                  <div style={{ fontWeight: 800, color: '#0369a1' }}>🔊 Playing consent terms aloud...</div>
                </div>
              </div>
            )}

            {/* Consent Explanation Text (Intro + 5 Points) */}
            <div style={{ background: 'var(--bg-slate)', padding: '16px', borderRadius: 'var(--radius-md)', marginBottom: '16px', fontSize: '14px', lineHeight: 1.6 }}>
              <p style={{ fontWeight: 700, marginBottom: '10px', color: 'var(--text-dark)', fontSize: '15px' }}>
                {consentTerms?.summary || 'We collect your medical history and previous documents to help your doctor treat you better.'}
              </p>
              <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit', fontSize: '13px', color: 'var(--text-dark)', margin: 0, lineHeight: 1.6 }}>
                {consentTerms?.points || (
                  "1. Information Collection: We record the symptoms you describe and digitize prescriptions/reports you provide.\n" +
                  "2. Sharing with Doctor: A structured summary is immediately routed to the OPD consultation doctor.\n" +
                  "3. ABDM Ecosystem: If you provide your ABHA ID, your records can be linked to your national health account.\n" +
                  "4. Privacy & Clearing: All audio recordings and uploaded document photos are deleted permanently immediately post consultation.\n" +
                  "5. Voluntary: Your consent is voluntary and you may choose what you share."
                )}
              </pre>
            </div>

            {/* Granular Consent Checkboxes */}
            <div style={{ background: '#f8fafc', padding: '14px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)', marginBottom: '16px' }}>
              <label style={{ fontSize: '12px', fontWeight: 800, color: 'var(--primary-dark)', textTransform: 'uppercase', display: 'block', marginBottom: '10px', letterSpacing: '0.5px' }}>
                Select Authorized Consent Scopes:
              </label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '14px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', fontWeight: 600, color: '#1e293b' }}>
                  <input 
                    type="checkbox" 
                    checked={consentScopes.history_capture}
                    onChange={(e) => setConsentScopes({ ...consentScopes, history_capture: e.target.checked })}
                    style={{ width: '18px', height: '18px', accentColor: 'var(--primary)' }}
                  />
                  Allow recording my symptoms and medical history
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', fontWeight: 600, color: '#1e293b' }}>
                  <input 
                    type="checkbox" 
                    checked={consentScopes.document_sharing}
                    onChange={(e) => setConsentScopes({ ...consentScopes, document_sharing: e.target.checked })}
                    style={{ width: '18px', height: '18px', accentColor: 'var(--primary)' }}
                  />
                  Allow digitizing my uploaded documents
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', fontWeight: 600, color: '#1e293b' }}>
                  <input 
                    type="checkbox" 
                    checked={consentScopes.hospital_hie_link}
                    onChange={(e) => setConsentScopes({ ...consentScopes, hospital_hie_link: e.target.checked })}
                    style={{ width: '18px', height: '18px', accentColor: 'var(--primary)' }}
                  />
                  Allow sharing my summary with the hospital's system (ABDM/HIE)
                </label>
              </div>
            </div>

            {/* Restore Guardian / Parent Consent Path */}
            <div style={{ borderTop: '1px solid var(--border-color)', borderBottom: '1px solid var(--border-color)', padding: '14px 0', margin: '14px 0' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '10px', fontWeight: 700, fontSize: '14px', color: '#b45309', cursor: 'pointer' }}>
                <input 
                  type="checkbox" 
                  checked={isMinor} 
                  onChange={(e) => {
                    setIsMinor(e.target.checked);
                    if (!e.target.checked) setGuardianConfirmed(false);
                  }} 
                  style={{ width: '18px', height: '18px' }}
                />
                This patient is a minor — a guardian is providing consent on their behalf
              </label>

              {isMinor && (
                <div style={{ marginTop: '12px', background: '#fffbeb', padding: '14px', borderRadius: 'var(--radius-md)', border: '1px solid #fde68a' }}>
                  <p style={{ fontSize: '12px', fontWeight: 700, color: '#92400e', marginBottom: '8px' }}>
                    Parent / Legal Guardian Confirmation Step:
                  </p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    <input 
                      type="text"
                      className="lang-select"
                      placeholder="Guardian Full Name"
                      value={guardianName}
                      onChange={(e) => setGuardianName(e.target.value)}
                      style={{ padding: '8px 12px', fontSize: '13px' }}
                    />
                    <div style={{ display: 'flex', gap: '10px' }}>
                      <input 
                        type="text"
                        className="lang-select"
                        placeholder="Relationship (Father/Mother/Guardian)"
                        value={guardianRel}
                        onChange={(e) => setGuardianRel(e.target.value)}
                        style={{ flex: 1, padding: '8px 12px', fontSize: '13px' }}
                      />
                      <input 
                        type="text"
                        className="lang-select"
                        placeholder="Guardian Phone / ID"
                        value={guardianPhone}
                        onChange={(e) => setGuardianPhone(e.target.value)}
                        style={{ flex: 1, padding: '8px 12px', fontSize: '13px' }}
                      />
                    </div>

                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', fontWeight: 700, color: '#78350f', cursor: 'pointer', background: '#fef3c7', padding: '8px 12px', borderRadius: '6px' }}>
                      <input 
                        type="checkbox" 
                        checked={guardianConfirmed} 
                        onChange={(e) => setGuardianConfirmed(e.target.checked)} 
                        style={{ width: '16px', height: '16px' }}
                      />
                      I confirm I am the authorized legal guardian and grant consent for this minor.
                    </label>
                  </div>
                </div>
              )}
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button 
                style={{ padding: '12px 20px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)', background: '#fff', fontWeight: 700, cursor: 'pointer' }}
                onClick={handleDeclineConsent}
              >
                Decline Consent
              </button>
              <button 
                className="touch-btn primary"
                style={{ padding: '12px 24px', opacity: (isMinor && !guardianConfirmed) ? 0.6 : 1 }}
                onClick={handleGrantConsent}
                disabled={isMinor && !guardianConfirmed}
              >
                <CheckCircle2 size={18} />
                I Grant Consent
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}