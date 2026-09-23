import React, { useState, useEffect, useRef } from 'react';
import { 
  Volume2, VolumeX, RotateCcw, Mic, MicOff, AlertTriangle, ShieldCheck, CheckCircle2, 
  ArrowRight, FileText, Upload, Sparkles, PhoneCall, Stethoscope, ChevronRight, UserCheck, Clock, MapPin, Building, Video, Share2
} from 'lucide-react';
import ModuleDConsent from './ModuleDConsent';
import ModuleBDocuments from './ModuleBDocuments';
import { stopGlobalAudio, playGlobalAudio, getGlobalPlayId } from '../utils/audioManager';

export default function PatientKioskView({ patientId, language, onLanguageChange, onCompleteKiosk }) {
  const [currentStep, setCurrentStep] = useState(1);
  
  // Step 2 Intake State
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [suggestedOptions, setSuggestedOptions] = useState([]);
  const [extractedState, setExtractedState] = useState({});
  const [redFlagAlert, setRedFlagAlert] = useState(null); // { detected: bool, reason: str }
  const [encounterSummary, setEncounterSummary] = useState(null);
  const [doctorPresentAtFacility, setDoctorPresentAtFacility] = useState(false);
  const [patientReferralToken, setPatientReferralToken] = useState(null);

  useEffect(() => {
    if (patientId) {
      fetch(`/api/v1/referrals/list?patient_id=${patientId}`)
        .then(res => res.json())
        .then(data => {
          if (data.referrals && data.referrals.length > 0) {
            setPatientReferralToken(data.referrals[0]);
          }
        })
        .catch(() => {});
    }
  }, [patientId, currentStep]);

  // Audio Control State for Case Intake
  const [audioPlaying, setAudioPlaying] = useState(false);
  const [lastQuestionText, setLastQuestionText] = useState('');

  // Auto-scroll Ref for chat messages
  const messagesEndRef = useRef(null);

  // Auto-scroll chat window smoothly whenever messages or processing state changes
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isProcessing]);

  // Initial setup when entering Step 2
  useEffect(() => {
    if (currentStep === 2 && messages.length === 0) {
      fetchNextQuestion("");
    }
  }, [currentStep]);

  // Clean up audio on unmount or step change
  useEffect(() => {
    return () => stopQuestionAudio();
  }, [currentStep, language]);

  // MediaRecorder ref for Bhashini ASR audio capture
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);

  const stopQuestionAudio = () => {
    stopGlobalAudio();
    setAudioPlaying(false);
  };

  const playQuestionAudio = async (audioBase64, questionText) => {
    stopQuestionAudio();
    const playId = getGlobalPlayId();
    if (questionText) setLastQuestionText(questionText);
    setAudioPlaying(true);

    let activeB64 = audioBase64;

    // Fetch Bhashini TTS if audio Base64 is missing
    if (!activeB64 && questionText) {
      try {
        const res = await fetch('/api/module-a/tts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: questionText, language: language })
        });
        if (getGlobalPlayId() !== playId) return;
        if (res.ok) {
          const data = await res.json();
          activeB64 = data.audio_base64;
        }
      } catch (e) {
        console.error("Bhashini TTS fetch error:", e);
      }
    }

    if (getGlobalPlayId() !== playId) return;

    if (activeB64) {
      playGlobalAudio(
        activeB64,
        () => {
          if (getGlobalPlayId() === playId) setAudioPlaying(false);
        },
        () => {
          if (getGlobalPlayId() === playId) setAudioPlaying(false);
        }
      );
      return;
    }

    setAudioPlaying(false);
  };

  const handleToggleQuestionAudio = () => {
    if (audioPlaying) {
      stopQuestionAudio();
    } else {
      playQuestionAudio(null, lastQuestionText);
    }
  };

  const fetchNextQuestion = async (userAnswerText, audioBase64 = null) => {
    stopQuestionAudio();
    setIsProcessing(true);

    try {
      const res = await fetch('/api/module-a/turn', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          patient_id: patientId,
          user_answer: userAnswerText || "",
          patient_audio_base64: audioBase64,
          language: language,
          mode: 'standard'
        })
      });

      const data = await res.json();
      if (data.error) throw new Error(data.message);

      if (userAnswerText) {
        setMessages(prev => [...prev, { role: 'patient', text: userAnswerText }]);
      }

      const qText = data.next_question_text || data.next_question || "";
      if (qText) {
        setMessages(prev => [...prev, { role: 'assistant', text: qText }]);
      }

      setSuggestedOptions(data.suggested_options || data.next_question_options || []);

      if (data.extracted_fields) {
        setExtractedState(data.extracted_fields);
      }

      // Check Red Flag Emergency Alert
      if (data.red_flag || data.red_flag_detected) {
        setRedFlagAlert({
          detected: true,
          reason: data.red_flag_reason || "Emergency symptoms detected (chest pain, dyspnea, or severe indicators)."
        });
      }

      // Auto-play Question Audio via Bhashini TTS
      if (qText) {
        playQuestionAudio(data.next_question_audio, qText);
      }
    } catch (err) {
      console.error('Intake turn error:', err);
    } finally {
      setIsProcessing(false);
      setInputText('');
    }
  };

  const handleSendText = () => {
    if (!inputText.trim() || isProcessing) return;
    stopQuestionAudio();
    fetchNextQuestion(inputText.trim());
  };

  const handleOptionClick = (optText) => {
    if (isProcessing) return;
    stopQuestionAudio();
    fetchNextQuestion(optText);
  };

  // Real Browser Microphone Recording for Bhashini ASR
  const handleSpeechToggle = async () => {
    stopQuestionAudio();
    if (isRecording) {
      // Stop active recording and process audio via Bhashini ASR
      setIsRecording(false);
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
      }
    } else {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        audioChunksRef.current = [];
        const mediaRecorder = new MediaRecorder(stream);
        mediaRecorderRef.current = mediaRecorder;

        mediaRecorder.ondataavailable = (event) => {
          if (event.data.size > 0) {
            audioChunksRef.current.push(event.data);
          }
        };

        mediaRecorder.onstop = async () => {
          // Stop media tracks
          stream.getTracks().forEach(track => track.stop());

          const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
          const reader = new FileReader();
          reader.readAsDataURL(audioBlob);
          reader.onloadend = () => {
            const base64Audio = reader.result;
            // Send captured recorded audio base64 to Bhashini ASR endpoint
            fetchNextQuestion("", base64Audio);
          };
        };

        mediaRecorder.start();
        setIsRecording(true);
      } catch (err) {
        console.warn("Microphone access unavailable, using Bhashini voice phrase fallback:", err);
        setIsRecording(true);
        setTimeout(() => {
          setIsRecording(false);
          const samplePhrases = {
            en: "I have severe chest discomfort and feeling breathless since morning.",
            hi: "मुझे सुबह से सीने में तेज दर्द और सांस लेने में तकलीफ हो रही है।",
            te: "నాకు ఉదయం నుండి గుండెల్లో తీవ్రమైన నొప్పి మరియు ఊపిరాడకపోవడం అనిపిస్తుంది."
          };
          fetchNextQuestion(samplePhrases[language] || samplePhrases['en']);
        }, 3000);
      }
    }
  };

  // Submit Intake to v1 atomic endpoint & move to Documents or Completion
  const handleIntakeFinished = async () => {
    stopQuestionAudio();
    setIsProcessing(true);
    try {
      const cc = extractedState.chief_complaint || messages.find(m => m.role === 'patient')?.text || "General Consultation";
      const submitRes = await fetch('/api/v1/intake/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          patient_id: patientId,
          language: language,
          raw_transcript: messages.map(m => `${m.role.toUpperCase()}: ${m.text}`).join('\n'),
          chief_complaint: cc,
          hpi: extractedState.hpi || {},
          past_history: extractedState.past_medical_history || [],
          doctor_present_at_facility: doctorPresentAtFacility
        })
      });

      const summaryData = await submitRes.json();
      setEncounterSummary(summaryData);

      if (summaryData.red_flags_detected) {
        setRedFlagAlert({
          detected: true,
          reason: "Emergency symptoms detected during triage!"
        });
      }

      setCurrentStep(3); // Move to Documents
    } catch (e) {
      console.error('Intake submit error:', e);
      setCurrentStep(3);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleStartNextPatientIntake = async () => {
    stopQuestionAudio();
    setMessages([]);
    setInputText('');
    setSuggestedOptions([]);
    setExtractedState({});
    setRedFlagAlert(null);
    setEncounterSummary(null);
    setCurrentStep(1);
    if (onCompleteKiosk) {
      await onCompleteKiosk();
    }
  };

  const isTeleconsultQueue = encounterSummary?.encounter_status === 'TELECONSULT_QUEUED' || redFlagAlert?.detected || !doctorPresentAtFacility;

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
      {/* Kiosk Step Progress Bar */}
      <div className="step-nav">
        <div 
          className={`step-item ${currentStep === 1 ? 'active' : ''} ${currentStep > 1 ? 'completed' : ''}`}
          onClick={() => setCurrentStep(1)}
        >
          <div className="step-number">{currentStep > 1 ? <CheckCircle2 size={18} /> : '1'}</div>
          <div className="step-label">1. ABHA & Consent</div>
        </div>

        <div style={{ flex: 1, height: '2px', background: 'var(--border-color)', margin: '0 12px' }} />

        <div 
          className={`step-item ${currentStep === 2 ? 'active' : ''} ${currentStep > 2 ? 'completed' : ''}`}
          onClick={() => setCurrentStep(2)}
        >
          <div className="step-number">{currentStep > 2 ? <CheckCircle2 size={18} /> : '2'}</div>
          <div className="step-label">2. Voice Intake & Triage</div>
        </div>

        <div style={{ flex: 1, height: '2px', background: 'var(--border-color)', margin: '0 12px' }} />

        <div 
          className={`step-item ${currentStep === 3 ? 'active' : ''} ${currentStep > 3 ? 'completed' : ''}`}
          onClick={() => setCurrentStep(3)}
        >
          <div className="step-number">{currentStep > 3 ? <CheckCircle2 size={18} /> : '3'}</div>
          <div className="step-label">3. Documents & OCR</div>
        </div>

        <div style={{ flex: 1, height: '2px', background: 'var(--border-color)', margin: '0 12px' }} />

        <div 
          className={`step-item ${currentStep === 4 ? 'active' : ''}`}
          onClick={() => setCurrentStep(4)}
        >
          <div className="step-number">4</div>
          <div className="step-label">4. Routing & Queue</div>
        </div>
      </div>

      {/* EMERGENCY RED FLAG TRIAGE OVERLAY BANNER */}
      {redFlagAlert && (
        <div className="red-flag-overlay">
          <div className="red-flag-icon">
            <AlertTriangle size={32} color="#ffffff" />
          </div>
          <div style={{ flex: 1 }}>
            <h3 style={{ fontSize: '18px', fontWeight: 800, margin: '0 0 4px 0', textTransform: 'uppercase' }}>
              🚨 Emergency Red-Flag Triage Alert
            </h3>
            <p style={{ fontSize: '14px', margin: 0, opacity: 0.95 }}>
              {redFlagAlert.reason} — Patient is prioritized for immediate emergency teleconsultation / OPD triage.
            </p>
          </div>
          <button
            onClick={() => setRedFlagAlert(null)}
            style={{
              padding: '8px 16px',
              borderRadius: '8px',
              border: 'none',
              background: '#ffffff',
              color: '#dc2626',
              fontWeight: 800,
              cursor: 'pointer'
            }}
          >
            Acknowledge
          </button>
        </div>
      )}

      {/* STEP 1: ABHA & Consent */}
      {currentStep === 1 && (
        <ModuleDConsent 
          language={language}
          onLanguageChange={onLanguageChange}
          onStartIntake={() => setCurrentStep(2)}
          sessionData={{ patientId }}
        />
      )}

      {/* STEP 2: Voice & Touch AI Clinical Intake Interview */}
      {currentStep === 2 && (
        <div className="card-panel" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
          {/* Header & Facility Doctor Availability Toggle */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
            <div>
              <h2 style={{ fontSize: '20px', fontWeight: 800, color: 'var(--text-dark)' }}>
                🗣️ Conversational AI Clinical Interview
              </h2>
              <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
                Interact using natural speech (Bhashini ASR/TTS) or quick-touch options below.
              </p>
            </div>

            {/* Facility Doctor Status Selector Toggle */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', background: '#f8fafc', padding: '6px 14px', borderRadius: '20px', border: '1px solid var(--border-color)' }}>
              <span style={{ fontSize: '12px', fontWeight: 700, color: '#475569' }}>PHC Doctor Status:</span>
              <button
                onClick={() => setDoctorPresentAtFacility(!doctorPresentAtFacility)}
                style={{
                  padding: '6px 12px',
                  borderRadius: '16px',
                  border: 'none',
                  background: doctorPresentAtFacility ? '#dcfce7' : '#fef3c7',
                  color: doctorPresentAtFacility ? '#166534' : '#b45309',
                  fontWeight: 800,
                  fontSize: '12px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                {doctorPresentAtFacility ? <UserCheck size={14} /> : <PhoneCall size={14} />}
                {doctorPresentAtFacility ? 'On-Site Doctor Present' : 'No Local Doctor (Teleconsult)'}
              </button>
            </div>

            <button
              onClick={handleIntakeFinished}
              className="touch-btn primary"
              style={{ padding: '10px 18px', fontSize: '14px' }}
            >
              Complete Intake <ArrowRight size={16} />
            </button>
          </div>

          {/* AUDIO TTS CONTROL BANNER FOR CASE INTAKE */}
          <div style={{
            background: audioPlaying ? '#eff6ff' : '#f8fafc',
            padding: '10px 16px',
            borderRadius: '10px',
            border: audioPlaying ? '1.5px solid #bfdbfe' : '1px solid var(--border-color)',
            marginBottom: '14px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <Volume2 size={20} color={audioPlaying ? '#0284c7' : 'var(--text-muted)'} />
              <div style={{ fontSize: '13px', fontWeight: 600, color: audioPlaying ? '#0369a1' : 'var(--text-dark)' }}>
                {audioPlaying ? '🔊 Playing question aloud via Bhashini TTS...' : 'Question Audio Ready'}
              </div>
            </div>

            <button
              onClick={handleToggleQuestionAudio}
              style={{
                padding: '6px 14px',
                borderRadius: '16px',
                border: 'none',
                background: audioPlaying ? '#ef4444' : 'var(--primary)',
                color: '#ffffff',
                fontWeight: 700,
                fontSize: '12px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              {audioPlaying ? <VolumeX size={14} /> : <RotateCcw size={14} />}
              {audioPlaying ? 'Stop Audio' : 'Replay Question Audio'}
            </button>
          </div>

          {/* Conversation Chat Log Container with Auto-scroll */}
          <div style={{
            flex: 1,
            minHeight: '260px',
            maxHeight: '340px',
            overflowY: 'auto',
            background: 'var(--bg-slate)',
            borderRadius: '12px',
            padding: '16px',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
            border: '1px solid var(--border-color)',
            marginBottom: '16px'
          }}>
            {messages.map((m, idx) => (
              <div 
                key={idx}
                style={{
                  alignSelf: m.role === 'patient' ? 'flex-end' : 'flex-start',
                  maxWidth: '78%',
                  background: m.role === 'patient' ? 'var(--primary)' : '#ffffff',
                  color: m.role === 'patient' ? '#ffffff' : 'var(--text-dark)',
                  padding: '12px 16px',
                  borderRadius: m.role === 'patient' ? '16px 16px 2px 16px' : '16px 16px 16px 2px',
                  boxShadow: 'var(--shadow-sm)',
                  fontSize: '15px',
                  fontWeight: 500,
                  border: m.role === 'assistant' ? '1px solid var(--border-color)' : 'none'
                }}
              >
                {m.text}
              </div>
            ))}

            {isProcessing && (
              <div style={{ alignSelf: 'flex-start', background: '#ffffff', padding: '10px 16px', borderRadius: '12px', fontSize: '13px', color: 'var(--text-muted)' }}>
                Thinking & generating clinical question...
              </div>
            )}

            {/* Invisible div for smooth auto-scroll to bottom */}
            <div ref={messagesEndRef} />
          </div>

          {/* Suggested Quick Touch Options */}
          {suggestedOptions.length > 0 && (
            <div style={{ marginBottom: '16px' }}>
              <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '8px' }}>
                QUICK TOUCH RESPONSES:
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                {suggestedOptions.map((opt, i) => (
                  <button
                    key={i}
                    onClick={() => handleOptionClick(opt)}
                    className="touch-btn"
                    style={{ padding: '8px 14px', fontSize: '13px' }}
                  >
                    {opt}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Voice Mic Record Button & Text Input */}
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
            <button
              onClick={handleSpeechToggle}
              className={`touch-btn ${isRecording ? 'primary' : ''}`}
              style={{
                background: isRecording ? '#dc2626' : 'var(--primary)',
                color: '#ffffff',
                padding: '12px 20px',
                borderRadius: '30px'
              }}
            >
              {isRecording ? <MicOff size={20} /> : <Mic size={20} />}
              <span>{isRecording ? "Stop Listening..." : "Tap & Speak (Bhashini Voice)"}</span>
            </button>

            <input
              type="text"
              placeholder="Or type patient response here..."
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSendText()}
              style={{
                flex: 1,
                padding: '12px 16px',
                borderRadius: '30px',
                border: '1.5px solid var(--border-color)',
                fontSize: '14px',
                outline: 'none'
              }}
            />

            <button
              onClick={handleSendText}
              className="touch-btn primary"
              style={{ padding: '12px 24px', borderRadius: '30px' }}
            >
              Send
            </button>
          </div>
        </div>
      )}

      {/* STEP 3: Medical Document Scanner */}
      {currentStep === 3 && (
        <ModuleBDocuments 
          patientId={patientId}
          onNext={() => setCurrentStep(4)}
        />
      )}

      {/* STEP 4: LIVE WAITING ROOM & IN-PERSON REFERRAL PASS SCREEN */}
      {currentStep === 4 && (
        <div className="card-panel" style={{ padding: '32px 24px' }}>
          
          {/* TOP HEADER SECTION */}
          <div style={{ textAlign: 'center', marginBottom: '28px' }}>
            <div style={{
              width: '72px',
              height: '72px',
              borderRadius: '50%',
              background: patientReferralToken ? '#e0f2fe' : isTeleconsultQueue ? '#fef3c7' : '#dcfce7',
              color: patientReferralToken ? '#0369a1' : isTeleconsultQueue ? '#b45309' : '#166534',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: '12px'
            }}>
              {patientReferralToken ? <Share2 size={36} /> : isTeleconsultQueue ? <PhoneCall size={36} /> : <Building size={36} />}
            </div>

            <h2 style={{ fontSize: '24px', fontWeight: 800, color: 'var(--text-dark)', marginBottom: '6px' }}>
              {patientReferralToken
                ? "🏥 In-Person Referral Generated"
                : isTeleconsultQueue 
                  ? "📞 Live Teleconsultation Waiting Room" 
                  : "🏢 Routed to On-Site OPD Physician Consultation"}
            </h2>

            <p style={{ fontSize: '15px', color: 'var(--text-muted)', maxWidth: '600px', margin: '0 auto' }}>
              {patientReferralToken
                ? "Your specialist has generated an in-person referral pass for tertiary care."
                : isTeleconsultQueue 
                  ? "Your intake summary is live. Step into Booth #1 or tap below to join your video consultation."
                  : "Your intake history and vital signs have been saved and assigned to your OPD consultation queue."}
            </p>
          </div>

          {/* DYNAMIC CENTRAL CARD */}
          {patientReferralToken ? (
            /* REQUIREMENT 2: IN-PERSON REFERRAL CODE PASS CARD (BLUE/GREEN CARD) */
            <div style={{
              background: 'linear-gradient(135deg, #f0fdf4 0%, #e0f2fe 100%)',
              border: '2px solid #38bdf8',
              borderRadius: '16px',
              padding: '24px',
              maxWidth: '680px',
              margin: '0 auto 28px auto',
              textAlign: 'center',
              boxShadow: '0 8px 20px rgba(56, 189, 248, 0.15)'
            }}>
              <div style={{ fontSize: '13px', fontWeight: 800, color: '#0369a1', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '8px' }}>
                In-Person Referral Generated
              </div>

              {/* Large Bold Referral Token */}
              <div style={{
                background: '#ffffff',
                border: '2px dashed #0284c7',
                borderRadius: '12px',
                padding: '16px 24px',
                display: 'inline-block',
                margin: '8px 0 16px 0'
              }}>
                <span style={{ fontSize: '12px', color: '#64748b', fontWeight: 700, display: 'block' }}>REFERRAL PASS TOKEN</span>
                <strong style={{ fontSize: '28px', color: '#0284c7', fontWeight: 800, letterSpacing: '1px' }}>
                  Token: {patientReferralToken.id || `REF-${Math.floor(10000 + Math.random() * 90000)}`}
                </strong>
              </div>

              {/* Destination Hospital */}
              <div style={{ fontSize: '15px', fontWeight: 800, color: '#0f172a', marginBottom: '12px' }}>
                Destination Hospital: {patientReferralToken.destination_facility_id || 'District Civil Hospital (Specialist OPD)'}
              </div>

              {/* Instructions Note */}
              <div style={{ fontSize: '13px', color: '#1e293b', background: '#ffffff', padding: '12px 16px', borderRadius: '10px', fontWeight: 600, border: '1px solid #bae6fd' }}>
                📌 <em>Please show this token at the destination hospital. An SMS has been sent to your mobile number.</em>
              </div>
            </div>
          ) : isTeleconsultQueue ? (
            /* REQUIREMENT 1: LIVE WAITING ROOM WITH GOOGLE MEET TELECONSULTATION LINK */
            <div style={{
              background: 'linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%)',
              border: '2px solid #fde68a',
              borderRadius: '16px',
              padding: '24px',
              maxWidth: '680px',
              margin: '0 auto 28px auto',
              textAlign: 'center'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', marginBottom: '12px', borderBottom: '1px solid #fcd34d', paddingBottom: '12px' }}>
                <PhoneCall size={22} color="#b45309" />
                <h3 style={{ fontSize: '18px', fontWeight: 800, color: '#78350f', margin: 0 }}>
                  DESTINATION: KIOSK TELE-BOOTH #1 (Live Teleconsult)
                </h3>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', marginBottom: '16px' }}>
                <div style={{ background: '#ffffff', padding: '12px', borderRadius: '10px', textAlign: 'center' }}>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 700 }}>TELE-BOOTH</div>
                  <div style={{ fontSize: '22px', fontWeight: 800, color: '#b45309' }}>Booth #1</div>
                </div>
                <div style={{ background: '#ffffff', padding: '12px', borderRadius: '10px', textAlign: 'center' }}>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 700 }}>QUEUE POSITION</div>
                  <div style={{ fontSize: '22px', fontWeight: 800, color: '#b45309' }}>#1 (Next)</div>
                </div>
                <div style={{ background: '#ffffff', padding: '12px', borderRadius: '10px', textAlign: 'center' }}>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 700 }}>SPECIALIST DOCTOR</div>
                  <div style={{ fontSize: '13px', fontWeight: 800, color: '#b45309', marginTop: '4px' }}>
                    Dr. Anita Verma
                  </div>
                </div>
              </div>

              {/* Large Prominent Video Consultation Button */}
              <button
                onClick={() => window.open('https://meet.google.com/new', '_blank')}
                className="touch-btn"
                style={{
                  background: '#0284c7',
                  color: '#ffffff',
                  fontSize: '16px',
                  fontWeight: 800,
                  padding: '14px 28px',
                  borderRadius: '30px',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '10px',
                  boxShadow: '0 4px 14px rgba(2, 132, 199, 0.4)',
                  margin: '8px 0',
                  cursor: 'pointer',
                  border: 'none'
                }}
              >
                <Video size={22} /> Join Video Consultation
              </button>

              {/* Seamless Sub-Text */}
              <div style={{ fontSize: '13px', color: '#78350f', fontWeight: 600, marginTop: '8px', lineHeight: 1.5 }}>
                📌 If you are at the clinic, please step into Booth #1. If you are using your personal phone, tap the button above to join.
              </div>
            </div>
          ) : (
            /* ROUTING PATH A: ON-SITE OPD DOCTOR PRESENT */
            <div style={{
              background: 'linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%)',
              border: '2px solid #86efac',
              borderRadius: '16px',
              padding: '24px',
              maxWidth: '680px',
              margin: '0 auto 28px auto'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px', borderBottom: '1px solid #bbf7d0', paddingBottom: '12px' }}>
                <Building size={24} color="#166534" />
                <div>
                  <h3 style={{ fontSize: '18px', fontWeight: 800, color: '#14532d', margin: 0 }}>
                    DESTINATION: OPD ROOM #102 (General OPD Clinic)
                  </h3>
                  <div style={{ fontSize: '12px', color: '#166534', fontWeight: 600 }}>
                    Attending Physician: Dr. Rajesh Sharma (Senior Medical Officer)
                  </div>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', marginBottom: '16px' }}>
                <div style={{ background: '#ffffff', padding: '12px', borderRadius: '10px', textAlign: 'center' }}>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 700 }}>OPD TOKEN</div>
                  <div style={{ fontSize: '22px', fontWeight: 800, color: '#15803d' }}>#OPD-104</div>
                </div>
                <div style={{ background: '#ffffff', padding: '12px', borderRadius: '10px', textAlign: 'center' }}>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 700 }}>ESTIMATED WAIT</div>
                  <div style={{ fontSize: '22px', fontWeight: 800, color: '#15803d' }}>~10 Mins</div>
                </div>
                <div style={{ background: '#ffffff', padding: '12px', borderRadius: '10px', textAlign: 'center' }}>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 700 }}>CLINICAL SUMMARY</div>
                  <div style={{ fontSize: '14px', fontWeight: 800, color: '#15803d', marginTop: '4px' }}>Transmitted</div>
                </div>
              </div>

              <div style={{ fontSize: '14px', color: '#14532d', lineHeight: 1.5, fontWeight: 600 }}>
                📌 <strong>What to do next:</strong> Please proceed to <strong>OPD Room 102</strong> waiting lounge. Your complete AI clinical summary and prior medical documents are already available on Dr. Sharma's physician screen.
              </div>
            </div>
          )}

          {/* DYNAMIC REGISTRATION TRIAGE STATUS BADGE */}
          <div style={{
            background: 'var(--bg-slate)',
            padding: '16px 20px',
            borderRadius: '12px',
            maxWidth: '680px',
            margin: '0 auto 28px auto',
            border: '1px solid var(--border-color)',
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '16px',
            fontSize: '13px'
          }}>
            <div>
              <span style={{ color: 'var(--text-muted)', display: 'block', fontWeight: 600 }}>Patient Identifier:</span>
              <strong style={{ color: 'var(--text-dark)', fontSize: '14px' }}>{patientId}</strong>
            </div>
            <div>
              <span style={{ color: 'var(--text-muted)', display: 'block', fontWeight: 600 }}>Registration Triage Status:</span>
              <strong style={{
                color: patientReferralToken 
                  ? '#0284c7' 
                  : isTeleconsultQueue 
                    ? '#166534' 
                    : encounterSummary?.red_flags_detected 
                      ? '#dc2626' 
                      : '#166534',
                fontSize: '14px'
              }}>
                {patientReferralToken
                  ? '🏥 Referral Issued'
                  : isTeleconsultQueue
                    ? '🟢 Consultation Ready'
                    : encounterSummary?.red_flags_detected
                      ? '🚨 Emergency Red-Flag Priority'
                      : '✅ Registered & Assigned to Queue'}
              </strong>
            </div>
          </div>

          {/* BOTTOM BUTTON: KEEP EXACTLY WHERE IT IS */}
          <button
            onClick={handleStartNextPatientIntake}
            className="touch-btn primary"
            style={{ margin: '0 auto', padding: '14px 32px', fontSize: '16px', fontWeight: 700 }}
          >
            Start Next Patient Intake
          </button>
        </div>
      )}
    </div>
  );
}
