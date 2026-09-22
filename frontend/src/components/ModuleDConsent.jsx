import React, { useState, useEffect, useRef } from 'react';
import { Shield, Volume2, VolumeX, RotateCcw, CheckCircle2, Lock, ArrowRight, Globe, ShieldCheck, AlertCircle } from 'lucide-react';

export default function ModuleDConsent({ language, onLanguageChange, onStartIntake, sessionData }) {
  const patientId = sessionData?.patientId || 'patient-session';
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
  const audioRef = useRef(null);

  // Restricted to English, Hindi, Telugu only
  const languages = [
    { code: 'hi', label: 'हिंदी (Hindi)' },
    { code: 'te', label: 'తెలుగు (Telugu)' },
    { code: 'en', label: 'English' },
  ];

  // Fetch Multilingual Consent Terms when language changes
  useEffect(() => {
    fetchConsentTerms();
  }, [language]);

  // Autoplay full consent audio immediately on view load
  useEffect(() => {
    playFullConsentAudio();
    return () => {
      stopAudio();
    };
  }, [language, consentTerms]);

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

  const stopAudio = () => {
    if (audioRef.current) {
      try {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
      } catch (e) {}
    }
    setAudioPlaying(false);
  };

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
          const snd = new Audio(`data:audio/mp3;base64,${data.audio_base64}`);
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

  const handleDeclineConsent = () => {
    stopAudio();
    alert("Consent declined. You may change options or speak with hospital staff for manual registration.");
  };

  // Submit Consent & Immediately Transition to Step 2 (Case Intake)
  const handleGrantConsent = () => {
    if (isMinor && !guardianConfirmed) {
      alert("Legal guardian confirmation is strictly required for minor patients.");
      return;
    }

    stopAudio();
    const selectedScopes = Object.keys(consentScopes).filter(k => consentScopes[k]);

    // Send backend submit in background
    fetch('/api/module-d/consent/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        patient_id: patientId,
        abha_id: patientId,
        consent_given: true,
        consent_language: language,
        consent_scope: selectedScopes,
        is_minor: isMinor,
        guardian_consent: isMinor ? guardianConfirmed : false,
        guardian_details: isMinor ? { name: guardianName, relationship: guardianRel, phone: guardianPhone } : null
      })
    }).catch(e => console.log('Consent background submit complete:', e));

    // Smooth transition to Case Intake (Step 2)
    if (onStartIntake) {
      onStartIntake(patientId);
    }
  };

  return (
    <div className="card-panel" style={{ maxWidth: '800px', margin: '20px auto', padding: '32px' }}>
      {/* Header Banner */}
      <div style={{ textAlign: 'center', marginBottom: '24px' }}>
        <div style={{ display: 'inline-flex', padding: '16px', background: 'var(--primary-light)', borderRadius: '50%', color: 'var(--primary)', marginBottom: '12px' }}>
          <Shield size={40} />
        </div>
        <h2 style={{ fontSize: '26px', fontWeight: 800, color: 'var(--text-dark)', marginBottom: '6px' }}>
          {consentTerms?.title || 'Patient Health Data & Privacy Consent'}
        </h2>
        <p style={{ color: 'var(--text-muted)', fontSize: '14px', margin: 0 }}>
          Ministry of Ayush / AIIA OPD Patient Data Governance & DPDP Act 2023 Compliance
        </p>
      </div>

      {/* Language Selector Bar (English, Hindi, Telugu) */}
      <div style={{
        background: '#f0f9ff',
        padding: '16px 20px',
        borderRadius: 'var(--radius-md)',
        border: '1.5px solid var(--primary-light)',
        marginBottom: '24px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '12px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 700, color: 'var(--primary-dark)', fontSize: '15px' }}>
          <Globe size={20} color="#0284c7" />
          Preferred Language (भाषा चुनें):
        </div>
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

      {/* Audio Autoplay Control Banner */}
      <div style={{
        background: audioPlaying ? '#eff6ff' : '#f8fafc',
        padding: '14px 20px',
        borderRadius: 'var(--radius-md)',
        border: audioPlaying ? '1.5px solid #bfdbfe' : '1px solid var(--border-color)',
        marginBottom: '20px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Volume2 size={22} color={audioPlaying ? '#0284c7' : 'var(--text-muted)'} className={audioPlaying ? 'animate-pulse' : ''} />
          <div>
            <strong style={{ fontSize: '14px', color: audioPlaying ? '#0369a1' : 'var(--text-dark)', display: 'block' }}>
              {audioPlaying ? '🔊 Playing consent terms aloud via Bhashini TTS...' : 'Consent Audio Ready'}
            </strong>
            <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
              Listen to full consent terms spoken in {languages.find(l => l.code === language)?.label}
            </span>
          </div>
        </div>

        <button 
          onClick={handleToggleAudio}
          style={{
            padding: '8px 18px',
            background: audioPlaying ? '#ef4444' : 'var(--primary)',
            color: '#fff',
            border: 'none',
            borderRadius: '20px',
            fontWeight: 700,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            fontSize: '13px'
          }}
        >
          {audioPlaying ? <VolumeX size={16} /> : <RotateCcw size={16} />}
          {audioPlaying ? 'Stop Audio' : 'Replay Audio'}
        </button>
      </div>

      {/* Consent Explanation Text */}
      <div style={{
        background: 'var(--bg-slate)',
        padding: '20px',
        borderRadius: 'var(--radius-md)',
        marginBottom: '24px',
        fontSize: '14px',
        lineHeight: 1.6,
        border: '1px solid var(--border-color)'
      }}>
        <p style={{ fontWeight: 700, marginBottom: '12px', color: 'var(--text-dark)', fontSize: '15px' }}>
          {consentTerms?.summary || 'We collect your medical history and prior documents to assist your attending OPD physician.'}
        </p>
        <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit', fontSize: '13px', color: 'var(--text-dark)', margin: 0, lineHeight: 1.6 }}>
          {consentTerms?.points || (
            "1. Information Collection: We record symptoms you narrate and digitize prior medical prescriptions/lab reports.\n" +
            "2. Sharing with Attending Doctor: Synthesized clinical notes are securely routed to your OPD physician dashboard.\n" +
            "3. ABDM Ecosystem Integration: If linked with your ABHA ID, your records can be synced to your health account.\n" +
            "4. Privacy & Data Clearing: Audio recordings and temporary images are cleared immediately post-consultation.\n" +
            "5. Voluntary Consent: Participation is voluntary and you may specify your authorized consent scopes."
          )}
        </pre>
      </div>

      {/* Authorized Consent Scopes Checkboxes */}
      <div style={{
        background: '#f8fafc',
        padding: '16px',
        borderRadius: 'var(--radius-md)',
        border: '1px solid var(--border-color)',
        marginBottom: '24px'
      }}>
        <label style={{ fontSize: '12px', fontWeight: 800, color: 'var(--primary-dark)', textTransform: 'uppercase', display: 'block', marginBottom: '12px', letterSpacing: '0.5px' }}>
          Authorized Consent Scopes:
        </label>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '14px' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', fontWeight: 600, color: '#1e293b' }}>
            <input 
              type="checkbox" 
              checked={consentScopes.history_capture}
              onChange={(e) => setConsentScopes({ ...consentScopes, history_capture: e.target.checked })}
              style={{ width: '18px', height: '18px', accentColor: 'var(--primary)' }}
            />
            Allow recording symptoms and clinical interview history
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', fontWeight: 600, color: '#1e293b' }}>
            <input 
              type="checkbox" 
              checked={consentScopes.document_sharing}
              onChange={(e) => setConsentScopes({ ...consentScopes, document_sharing: e.target.checked })}
              style={{ width: '18px', height: '18px', accentColor: 'var(--primary)' }}
            />
            Allow OCR digitization of uploaded prescriptions and lab reports
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', fontWeight: 600, color: '#1e293b' }}>
            <input 
              type="checkbox" 
              checked={consentScopes.hospital_hie_link}
              onChange={(e) => setConsentScopes({ ...consentScopes, hospital_hie_link: e.target.checked })}
              style={{ width: '18px', height: '18px', accentColor: 'var(--primary)' }}
            />
            Allow transmitting summary to attending OPD physician dashboard & ABDM/HIE
          </label>
        </div>
      </div>

      {/* Guardian / Minor Consent Section */}
      <div style={{
        background: isMinor ? '#fffbeb' : '#f8fafc',
        padding: '14px 16px',
        borderRadius: 'var(--radius-md)',
        border: isMinor ? '1.5px solid #fde68a' : '1px solid var(--border-color)',
        marginBottom: '28px'
      }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: '10px', fontWeight: 700, fontSize: '14px', color: isMinor ? '#b45309' : 'var(--text-dark)', cursor: 'pointer' }}>
          <input 
            type="checkbox" 
            checked={isMinor} 
            onChange={(e) => {
              setIsMinor(e.target.checked);
              if (!e.target.checked) setGuardianConfirmed(false);
            }} 
            style={{ width: '18px', height: '18px' }}
          />
          Patient is a minor — a legal guardian is providing consent
        </label>

        {isMinor && (
          <div style={{ marginTop: '12px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px' }}>
              <input 
                type="text"
                className="lang-select"
                placeholder="Guardian Full Name"
                value={guardianName}
                onChange={(e) => setGuardianName(e.target.value)}
                style={{ padding: '8px 12px', fontSize: '13px' }}
              />
              <input 
                type="text"
                className="lang-select"
                placeholder="Relationship (Parent/Guardian)"
                value={guardianRel}
                onChange={(e) => setGuardianRel(e.target.value)}
                style={{ padding: '8px 12px', fontSize: '13px' }}
              />
              <input 
                type="text"
                className="lang-select"
                placeholder="Guardian Mobile"
                value={guardianPhone}
                onChange={(e) => setGuardianPhone(e.target.value)}
                style={{ padding: '8px 12px', fontSize: '13px' }}
              />
            </div>

            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', fontWeight: 700, color: '#78350f', cursor: 'pointer', background: '#fef3c7', padding: '8px 12px', borderRadius: '6px' }}>
              <input 
                type="checkbox" 
                checked={guardianConfirmed} 
                onChange={(e) => setGuardianConfirmed(e.target.checked)} 
                style={{ width: '16px', height: '16px' }}
              />
              I confirm I am the legal guardian and grant consent for this minor.
            </label>
          </div>
        )}
      </div>

      {/* Main Action Buttons */}
      <div style={{ display: 'flex', gap: '16px', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
        <button 
          style={{ padding: '14px 24px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)', background: '#fff', fontWeight: 700, fontSize: '15px', cursor: 'pointer' }}
          onClick={handleDeclineConsent}
        >
          Decline Consent
        </button>
        <button 
          className="touch-btn primary"
          style={{ padding: '14px 32px', fontSize: '16px', fontWeight: 700, opacity: (isMinor && !guardianConfirmed) ? 0.6 : 1 }}
          onClick={handleGrantConsent}
          disabled={isMinor && !guardianConfirmed}
        >
          <CheckCircle2 size={20} />
          I Grant Consent & Proceed to Case Intake →
        </button>
      </div>
    </div>
  );
}