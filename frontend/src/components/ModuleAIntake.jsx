import React, { useState, useEffect, useRef } from 'react';
import { Mic, MicOff, Volume2, AlertOctagon, CheckCircle, RefreshCw, Send, Sparkles, Activity, ShieldAlert } from 'lucide-react';

export default function ModuleAIntake({ patientId, language, onComplete }) {
  const [mode, setMode] = useState('standard'); // 'standard' or 'ayush'
  const [currentQuestionText, setCurrentQuestionText] = useState('What problem brings you to the hospital today?');
  const [nextAudioBase64, setNextAudioBase64] = useState(null);
  const [patientAnswerText, setPatientAnswerText] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [redFlag, setRedFlag] = useState({ detected: false, reason: null });
  const [conversationHistory, setConversationHistory] = useState([]);
  const [turnCount, setTurnCount] = useState(0);
  const [audioPlaying, setAudioPlaying] = useState(false);
  const [nextQuestionOptions, setNextQuestionOptions] = useState([]);

  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);


  // Quick-choice touch pills for low-literacy/elderly users (fallback)
  const quickChoices = {
    standard: [
      'Joint Pain (घुटने में दर्द)',
      'Fever & Bodyache (बुखार)',
      'Stomach Pain (पेट दर्द)',
      'Cough & Cold (खांसी और जुकाम)',
      'Started 2 days ago (2 दिन से)',
      'Sharp pain (तेज़ चुभने वाला दर्द)',
      'Rest makes it better (आराम से ठीक)',
    ],
    ayush: [
      'Prakriti: Heat Sensitive (गर्मी ज्यादा लगती है)',
      'Ahara: Poor Digestion (पाचन कमजोर)',
      'Vikriti: Gas & Bloating (गैस / वात)',
      'Sattva: High Stress (मानसिक तनाव)',
      'Vyayama: Easily Tired (जल्दी थकान)',
      'Ahara-Vihara: Irregular Sleep (अनियमित नींद)',
    ]
  };

  const [isInterviewFinished, setIsInterviewFinished] = useState(false);
  const [extractedFields, setExtractedFields] = useState(null);

  // 1. Initial turn fetch on component mount or mode change
  useEffect(() => {
    stopTtsAudio();
    cancelActiveRecording();
    setConversationHistory([]);
    setTurnCount(0);
    setNextQuestionOptions([]);
    setExtractedFields(null);
    setIsInterviewFinished(false);
    fetchInitialQuestion();
  }, [patientId, language, mode]);

  const fetchInitialQuestion = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/module-a/turn', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          patient_id: patientId,
          language: language,
          mode: mode
        })
      });
      if (res.ok) {
        const data = await res.json();
        setCurrentQuestionText(data.next_question_text || 'What brings you to the hospital today?');
        setNextAudioBase64(data.next_question_audio);
        setNextQuestionOptions(data.next_question_options || []);
        setRedFlag({ detected: data.red_flag_detected, reason: data.red_flag_reason });
      }
    } catch (err) {
      console.error('Failed to fetch initial question:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const cancelActiveRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try {
        mediaRecorderRef.current.onstop = null;
        mediaRecorderRef.current.stop();
        if (mediaRecorderRef.current.stream) {
          mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
        }
      } catch (e) {
        console.error('Error canceling recording:', e);
      }
    }
    setIsRecording(false);
  };

  // 2. Submit patient turn (Text or Voice)
  const submitTurn = async (answerText, audioBase64 = null) => {
    if (isLoading) return;
    if (!answerText && !audioBase64) return;

    stopTtsAudio();
    cancelActiveRecording();

    setIsLoading(true);
    setConversationHistory(prev => [...prev, {
      question: currentQuestionText,
      answer: answerText || '[Voice Recording Uploaded]'
    }]);

    try {
      const res = await fetch('/api/module-a/turn', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          patient_id: patientId,
          language: language,
          mode: mode,
          patient_answer_text: answerText,
          patient_audio_base64: audioBase64
        })
      });

      if (res.ok) {
        const data = await res.json();
        setPatientAnswerText('');
        setTurnCount(prev => prev + 1);

        if (data.extracted_fields) {
          setExtractedFields(data.extracted_fields);
        }

        if (data.red_flag_detected) {
          setRedFlag({ detected: true, reason: data.red_flag_reason });
        }

        if (data.conversation_complete) {
          // Show Clinical Summary view instead of abruptly switching screen
          setIsInterviewFinished(true);
        } else if (data.next_question_text) {
          setCurrentQuestionText(data.next_question_text);
          setNextAudioBase64(data.next_question_audio);
          setNextQuestionOptions(data.next_question_options || []);
        }
      }
    } catch (err) {
      console.error('Turn submission error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const audioRef = useRef(null);

  const stopTtsAudio = () => {
    if (audioRef.current) {
      try {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
      } catch (e) {}
    }
    setAudioPlaying(false);
  };

  // Play Bhashini TTS question audio (direct playback on question change)
  const playTtsAudio = async (overrideAudioB64 = null, textToSpeak = null) => {
    stopTtsAudio();
    cancelActiveRecording();
    setAudioPlaying(true);

    let audioB64 = overrideAudioB64 || nextAudioBase64;
    const targetText = textToSpeak || currentQuestionText;

    if (!audioB64 && targetText) {
      try {
        const res = await fetch('/api/module-a/tts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text: targetText,
            language: language
          })
        });
        if (res.ok) {
          const data = await res.json();
          audioB64 = data.audio_base64;
          setNextAudioBase64(audioB64);
        }
      } catch (e) {
        console.error('Bhashini TTS fetch error:', e);
      }
    }

    if (audioB64) {
      try {
        const snd = new Audio(`data:audio/wav;base64,${audioB64}`);
        audioRef.current = snd;

        snd.onended = () => {
          setAudioPlaying(false);
        };

        snd.onerror = () => {
          setAudioPlaying(false);
        };

        await snd.play();
        return;
      } catch (e) {
        console.error('Bhashini TTS playback error:', e);
      }
    }

    setAudioPlaying(false);
  };

  // Autoplay question TTS as soon as question changes
  useEffect(() => {
    if (currentQuestionText && !isInterviewFinished) {
      playTtsAudio(nextAudioBase64, currentQuestionText);
    }
  }, [currentQuestionText]);

  const startRecording = async () => {
    if (isRecording) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported('audio/webm') 
        ? 'audio/webm' 
        : MediaRecorder.isTypeSupported('audio/mp4') 
          ? 'audio/mp4' 
          : 'audio/wav';

      const mediaRecorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        setIsRecording(false);
        const audioBlob = new Blob(audioChunksRef.current, { type: mimeType });
        const reader = new FileReader();
        reader.onloadend = () => {
          const base64Audio = reader.result;
          // Send live base64 recorded audio to Bhashini ASR
          submitTurn('', base64Audio);
        };
        reader.readAsDataURL(audioBlob);

        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch (err) {
      console.error('Microphone access error:', err);
      setIsRecording(false);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try {
        mediaRecorderRef.current.stop();
      } catch (e) {}
    }
    setIsRecording(false);
  };

  // User clicks mic button or TTS button
  const handleMicClick = () => {
    if (audioPlaying) {
      stopTtsAudio();
      startRecording();
    } else if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  };

  if (isInterviewFinished) {
    return (
      <div style={{ maxWidth: '960px', margin: '0 auto', width: '100%' }}>
        <div className="card-panel" style={{ padding: '32px', textAlign: 'center' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '64px', height: '64px', borderRadius: '50%', background: 'var(--success-light, #dcfce7)', color: 'var(--success, #16a34a)', marginBottom: '16px' }}>
            <CheckCircle size={36} />
          </div>
          <h2 style={{ fontSize: '24px', fontWeight: 800, color: 'var(--text-dark)', marginBottom: '8px' }}>
            Clinical History Intake Completed
          </h2>
          <p style={{ fontSize: '15px', color: 'var(--text-muted)', marginBottom: '24px', maxWidth: '600px', margin: '0 auto 24px' }}>
            All required history-taking parameters ({mode === 'ayush' ? 'Ayurvedic Dashavidha Pariksha' : 'Allopathic HPI SOCRATES & Past History'}) have been systematically collected and saved to your session.
          </p>

          {/* Structured Clinical Summary Card */}
          {extractedFields && (
            <div style={{ textAlign: 'left', background: 'var(--bg-slate)', borderRadius: 'var(--radius-md)', padding: '20px', marginBottom: '24px', fontSize: '14px' }}>
              <h4 style={{ fontSize: '15px', fontWeight: 700, color: 'var(--primary-dark)', marginBottom: '12px' }}>
                Summary of Extracted Clinical Information:
              </h4>

              {extractedFields.chief_complaint?.value && (
                <div style={{ marginBottom: '8px' }}>
                  <strong>Chief Complaint:</strong> {extractedFields.chief_complaint.value}
                </div>
              )}

              {mode === 'standard' && (
                <>
                  {extractedFields.hpi && (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '10px', marginTop: '12px' }}>
                      {Object.entries(extractedFields.hpi).map(([key, field]) => field?.value && (
                        <div key={key} style={{ background: '#fff', padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
                          <span style={{ textTransform: 'capitalize', color: 'var(--text-muted)', fontSize: '12px', display: 'block' }}>{key.replace('_', ' ')}</span>
                          <strong style={{ color: 'var(--text-dark)' }}>{field.value}</strong>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Past & Personal History Sections */}
                  <div style={{ marginTop: '14px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {extractedFields.past_medical_history && extractedFields.past_medical_history.length > 0 && (
                      <div style={{ background: '#fff', padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
                        <span style={{ color: 'var(--text-muted)', fontSize: '12px', display: 'block', fontWeight: 700 }}>Past Medical & Surgical History</span>
                        <strong style={{ color: 'var(--text-dark)' }}>{extractedFields.past_medical_history.join(', ')}</strong>
                      </div>
                    )}

                    {extractedFields.drug_allergy_history && extractedFields.drug_allergy_history.length > 0 && (
                      <div style={{ background: '#fff', padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
                        <span style={{ color: 'var(--text-muted)', fontSize: '12px', display: 'block', fontWeight: 700 }}>Drug & Food Allergies / Current Meds</span>
                        <strong style={{ color: 'var(--text-dark)' }}>{extractedFields.drug_allergy_history.join(', ')}</strong>
                      </div>
                    )}

                    {extractedFields.family_history && extractedFields.family_history.length > 0 && (
                      <div style={{ background: '#fff', padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
                        <span style={{ color: 'var(--text-muted)', fontSize: '12px', display: 'block', fontWeight: 700 }}>Family Medical History</span>
                        <strong style={{ color: 'var(--text-dark)' }}>{extractedFields.family_history.join(', ')}</strong>
                      </div>
                    )}

                    {extractedFields.personal_history && extractedFields.personal_history.length > 0 && (
                      <div style={{ background: '#fff', padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
                        <span style={{ color: 'var(--text-muted)', fontSize: '12px', display: 'block', fontWeight: 700 }}>Personal & Lifestyle History (Diet/Exercise/Habits)</span>
                        <strong style={{ color: 'var(--text-dark)' }}>{extractedFields.personal_history.join(', ')}</strong>
                      </div>
                    )}
                  </div>
                </>
              )}

              {mode === 'ayush' && extractedFields.ayush && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '10px', marginTop: '12px' }}>
                  {Object.entries(extractedFields.ayush).map(([key, field]) => field?.value && (
                    <div key={key} style={{ background: '#fff', padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
                      <span style={{ textTransform: 'capitalize', color: 'var(--text-muted)', fontSize: '12px', display: 'block' }}>{key.replace('_', ' ')}</span>
                      <strong style={{ color: 'var(--text-dark)' }}>{field.value}</strong>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* User Control Buttons */}
          <div style={{ display: 'flex', gap: '16px', justifyContent: 'center', flexWrap: 'wrap' }}>
            <button 
              className="touch-btn primary"
              style={{ padding: '14px 28px', fontSize: '16px', fontWeight: 700 }}
              onClick={() => onComplete(patientId)}
            >
              Proceed to Document Upload (Prescriptions/Reports) →
            </button>
            <button 
              className="touch-btn"
              style={{ padding: '14px 24px', fontSize: '15px' }}
              onClick={() => setIsInterviewFinished(false)}
            >
              <RefreshCw size={16} style={{ marginRight: '6px' }} />
              Add More Details / Continue Intake
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: '960px', margin: '0 auto', width: '100%' }}>
      {/* Priority Red-Flag Emergency Alert Overlay */}
      {redFlag.detected && (
        <div className="red-flag-overlay">
          <div className="red-flag-icon">
            <AlertOctagon size={36} color="#ffffff" />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '18px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              🚨 Emergency Priority Alert (Red-Flag Interceptor Active)
            </div>
            <p style={{ fontSize: '15px', marginTop: '4px', opacity: 0.95 }}>
              {redFlag.reason || 'Life-threatening symptom pattern detected during intake.'}
            </p>
            <div style={{ marginTop: '10px', fontSize: '14px', fontWeight: 700, background: 'rgba(0,0,0,0.2)', padding: '8px 14px', borderRadius: '8px', display: 'inline-block' }}>
              ⚠️ Action: Patient instructed to proceed directly to Triage Desk 1 / Resuscitation Bay.
            </div>
          </div>
        </div>
      )}

      {/* Mode Selector Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <div>
          <h2 style={{ fontSize: '22px', fontWeight: 800 }}>Clinical History Intake</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '13px' }}>
            Interactive Outpatient Symptom Assessment & Clinical Evaluation
          </p>
        </div>

        <div style={{ display: 'flex', gap: '10px' }}>
          <button 
            className={`touch-btn ${mode === 'standard' ? 'primary' : ''}`}
            style={{ padding: '8px 16px', fontSize: '14px' }}
            onClick={() => setMode('standard')}
          >
            Standard OPD
          </button>
          <button 
            className={`touch-btn ${mode === 'ayush' ? 'ayush' : ''}`}
            style={{ padding: '8px 16px', fontSize: '14px' }}
            onClick={() => setMode('ayush')}
          >
            AYUSH OPD
          </button>
        </div>
      </div>

      {/* Main Question Card Panel */}
      <div className="card-panel" style={{ marginBottom: '24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
          <span className="badge" style={{ background: mode === 'ayush' ? 'var(--ayush-light)' : 'var(--primary-light)', color: mode === 'ayush' ? 'var(--ayush-teal)' : 'var(--primary-dark)', padding: '6px 12px', fontSize: '13px' }}>
            <Activity size={14} />
            Question #{turnCount + 1} — {mode === 'ayush' ? 'AYUSH Assessment' : 'Symptom Exploration'}
          </span>

          {/* Audio TTS Button */}
          <button 
            onClick={playTtsAudio}
            style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 16px', borderRadius: '20px', border: '1.5px solid var(--primary)', background: audioPlaying ? 'var(--primary-light)' : '#fff', color: 'var(--primary-dark)', fontWeight: 700, cursor: 'pointer', fontSize: '13px' }}
          >
            <Volume2 size={16} />
            {audioPlaying ? 'Playing Audio...' : 'Listen to Question (TTS)'}
          </button>
        </div>

        {/* Question Text Display */}
        <div style={{ minHeight: '80px', display: 'flex', alignItems: 'center' }}>
          {isLoading ? (
            <div style={{ color: 'var(--text-muted)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}>
              <RefreshCw className="spin" size={18} />
              Analyzing symptoms & formulating follow-up question...
            </div>
          ) : (
            <h3 style={{ fontSize: '22px', fontWeight: 800, color: 'var(--text-dark)', lineHeight: 1.4 }}>
              "{currentQuestionText}"
            </h3>
          )}
        </div>

        {/* Big Mic Button (Voice Intake) */}
        <div className="mic-btn-container">
          <button 
            className={`mic-btn ${isRecording ? 'recording' : ''}`}
            onClick={handleMicClick}
            title="Click to speak your answer"
          >
            {isRecording ? <MicOff size={40} /> : <Mic size={40} />}
          </button>
          <span style={{ fontSize: '14px', fontWeight: 700, marginTop: '10px', color: isRecording ? '#dc2626' : 'var(--text-muted)' }}>
            {isRecording ? '🔴 Listening... (Speak Now)' : 'Tap Mic to Speak Answer (Voice Mode)'}
          </span>
        </div>

        {/* Large Touch Quick-Choice Pills (Elderly/Low-Literacy Friendly) */}
        <div style={{ marginTop: '20px' }}>
          <label style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: '10px' }}>
            Or Tap a Quick Touch Answer (Touch Mode):
          </label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
            {((nextQuestionOptions && nextQuestionOptions.length > 0) ? nextQuestionOptions : quickChoices[mode]).map((choice, i) => (
              <button 
                key={i}
                className="touch-btn"
                style={{ padding: '10px 16px', fontSize: '14px', flex: '1 1 auto' }}
                onClick={() => submitTurn(choice)}
              >
                {choice}
              </button>
            ))}
          </div>
        </div>

        {/* Manual Text Input */}
        <div style={{ marginTop: '24px', display: 'flex', gap: '10px' }}>
          <input 
            type="text"
            className="lang-select"
            style={{ flex: 1, padding: '14px', fontSize: '15px' }}
            placeholder="Type your answer here in any language..."
            value={patientAnswerText}
            onChange={(e) => setPatientAnswerText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submitTurn(patientAnswerText)}
          />
          <button 
            className="touch-btn primary"
            onClick={() => submitTurn(patientAnswerText)}
            disabled={!patientAnswerText.trim()}
          >
            <Send size={18} />
            Submit Turn
          </button>
        </div>
      </div>

      {/* Conversation Transcript History */}
      {conversationHistory.length > 0 && (
        <div className="card-panel">
          <h4 style={{ fontSize: '16px', fontWeight: 700, marginBottom: '14px' }}>Intake History Transcript</h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {conversationHistory.map((item, idx) => (
              <div key={idx} style={{ background: 'var(--bg-slate)', padding: '12px 16px', borderRadius: 'var(--radius-md)', fontSize: '14px' }}>
                <div style={{ fontWeight: 700, color: 'var(--primary-dark)', marginBottom: '4px' }}>Q: {item.question}</div>
                <div style={{ color: 'var(--text-dark)' }}>A: {item.answer}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
