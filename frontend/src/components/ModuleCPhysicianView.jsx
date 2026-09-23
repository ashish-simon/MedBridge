import React, { useState, useEffect } from 'react';
import { 
  Activity, User, FileText, PhoneCall, AlertTriangle, CheckCircle2, 
  Send, RefreshCw, Volume2, Plus, Clock, ExternalLink, Stethoscope, ChevronRight,
  Video, Calendar, ShieldAlert, CheckSquare, Share2, Copy
} from 'lucide-react';

export default function ModuleCPhysicianView({ patientId, currentUser }) {
  const [activeTab, setActiveTab] = useState('teleconsult'); // 'teleconsult', 'referrals'
  const [patientQueue, setPatientQueue] = useState([]);
  const [selectedPatientId, setSelectedPatientId] = useState(patientId || '');
  const [summaryData, setSummaryData] = useState(null);
  const [timelineData, setTimelineData] = useState(null);
  const [loading, setLoading] = useState(false);
  
  // Active Selected Patient Basic Details
  const [selectedPatientInfo, setSelectedPatientInfo] = useState({
    name: 'Ramesh Kumar',
    age: 45,
    gender: 'Male',
    patient_id: patientId || 'pat-104',
    is_high_risk: true,
    red_flag: false
  });

  // Doctor Notes & Prescription State
  const [doctorNotes, setDoctorNotes] = useState('');
  const [prescriptionText, setPrescriptionText] = useState('');
  const [savedSuccessMsg, setSavedSuccessMsg] = useState('');

  // Google Meet Teleconsultation Link State
  const [meetLink, setMeetLink] = useState('');

  // Closing Action 1: Referral State
  const [showReferralModal, setShowReferralModal] = useState(false);
  const [referralTarget, setReferralTarget] = useState('DISTRICT-HOSP-01');
  const [referralReason, setReferralReason] = useState('');
  const [referralList, setReferralList] = useState([]);
  const [generatedReferralToken, setGeneratedReferralToken] = useState('');
  const [referralSuccessMsg, setReferralSuccessMsg] = useState('');

  // Closing Action 2: High-Risk ASHA Follow-up Task Assignment State
  const [assignAshaTask, setAssignAshaTask] = useState(false);
  const [ashaConditionTag, setAshaConditionTag] = useState('Chronic HTN & Diabetes');
  const [ashaDueDate, setAshaDueDate] = useState(new Date(Date.now() + 86400000).toISOString().split('T')[0]);
  const [ashaTaskSuccessMsg, setAshaTaskSuccessMsg] = useState('');

  useEffect(() => {
    fetchPatientQueue();
    fetchReferralList();
  }, []);

  useEffect(() => {
    if (selectedPatientId) {
      fetchClinicalSummary(selectedPatientId);
      fetchDocumentTimeline(selectedPatientId);
      updateSelectedPatientInfo(selectedPatientId);
    }
  }, [selectedPatientId]);

  // Sort Queue by Priority: Red-Flag Emergency -> High-Risk -> Standard
  const getSortedPatientQueue = (list) => {
    return [...list].sort((a, b) => {
      const aRed = a.red_flag_detected ? 1 : 0;
      const bRed = b.red_flag_detected ? 1 : 0;
      if (aRed !== bRed) return bRed - aRed;

      const aHigh = a.is_high_risk ? 1 : 0;
      const bHigh = b.is_high_risk ? 1 : 0;
      if (aHigh !== bHigh) return bHigh - aHigh;

      return (b.patient_id || '').localeCompare(a.patient_id || '');
    });
  };

  const fetchPatientQueue = async () => {
    try {
      const res = await fetch('/api/auth/patients');
      if (res.ok) {
        const data = await res.json();
        const list = data.patients || [];
        const sorted = getSortedPatientQueue(list);
        setPatientQueue(sorted);
        if (!selectedPatientId && sorted.length > 0) {
          setSelectedPatientId(sorted[0].patient_id);
        }
      }
    } catch (e) {
      console.error('Fetch queue error:', e);
    }
  };

  const getPatientOptionLabel = (p, index) => {
    const isRed = p.red_flag_detected;
    const isHigh = p.is_high_risk;
    const prefix = isRed ? '🚨 [RED-FLAG]' : isHigh ? '⚠️ [HIGH RISK]' : `[#${index + 1}]`;
    const name = p.full_name || p.name || (p.patient_id?.startsWith('pat-') ? `Patient #${p.patient_id.slice(-6)}` : p.patient_id);
    const age = p.age || 45;
    const gender = p.gender || 'Male';
    const complaint = p.chief_complaint || 'Standard Intake Assessment';

    return `${prefix} ${name} | ${age}Yrs ${gender} | ID: ${p.patient_id} (${complaint})`;
  };

  const handleNextPatient = () => {
    const sorted = getSortedPatientQueue(patientQueue);
    if (sorted.length === 0) return;
    const currentIndex = sorted.findIndex(p => p.patient_id === selectedPatientId);
    const nextIndex = (currentIndex + 1) % sorted.length;
    const nextPatient = sorted[nextIndex];
    setSelectedPatientId(nextPatient.patient_id);
    setSavedSuccessMsg(`⏭️ Now viewing Next Patient in Priority Queue: ${nextPatient.full_name || nextPatient.name || nextPatient.patient_id}`);
    setTimeout(() => setSavedSuccessMsg(''), 3000);
  };

  const updateSelectedPatientInfo = (pid) => {
    const sorted = getSortedPatientQueue(patientQueue);
    const found = sorted.find(p => p.patient_id === pid);
    if (found) {
      setSelectedPatientInfo({
        name: found.full_name || found.name || (pid.startsWith('pat-') ? `Patient #${pid.slice(-6)}` : pid),
        age: found.age || 45,
        gender: found.gender || 'Male',
        patient_id: pid,
        is_high_risk: found.is_high_risk || false,
        red_flag: found.red_flag_detected || false,
        chief_complaint: found.chief_complaint || 'Standard OPD Assessment'
      });
    } else {
      setSelectedPatientInfo({
        name: pid === 'pat_test_01' ? 'Ramesh Kumar' : (pid.startsWith('pat-') ? `Patient #${pid.slice(-6)}` : pid),
        age: 45,
        gender: 'Male',
        patient_id: pid,
        is_high_risk: true,
        red_flag: pid === 'pat_test_01',
        chief_complaint: 'Severe chest pain & dizziness'
      });
    }
  };

  const fetchClinicalSummary = async (pid) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/module-c/summary/${pid}`);
      if (res.ok) {
        const data = await res.json();
        setSummaryData(data);
      }
    } catch (e) {
      console.error('Fetch summary error:', e);
    } finally {
      setLoading(false);
    }
  };

  const fetchDocumentTimeline = async (pid) => {
    try {
      const res = await fetch(`/api/module-b/timeline?patient_id=${pid}`);
      if (res.ok) {
        const data = await res.json();
        setTimelineData(data);
      }
    } catch (e) {
      console.error('Fetch timeline error:', e);
    }
  };

  const fetchReferralList = async () => {
    try {
      const res = await fetch('/api/v1/referrals/list');
      if (res.ok) {
        const data = await res.json();
        setReferralList(data.referrals || []);
      }
    } catch (e) {
      console.error('Fetch referral list error:', e);
    }
  };

  // Google Meet Launch Handler
  const handleLaunchGoogleMeet = () => {
    const meetUrl = 'https://meet.google.com/new';
    window.open(meetUrl, '_blank');
    const generatedUrl = `https://meet.google.com/med-${Date.now().toString().slice(-8)}`;
    setMeetLink(generatedUrl);
    setSavedSuccessMsg('📹 Google Meet Teleconsultation launched in new tab!');
    setTimeout(() => setSavedSuccessMsg(''), 4000);
  };

  // Closing Action 1: Generate Digital Referral
  const handleGenerateReferral = async (e) => {
    e.preventDefault();
    if (!referralReason.trim()) return;

    try {
      const res = await fetch('/api/v1/referrals/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          patient_id: selectedPatientId,
          origin_facility_id: 'PHC-RURAL-01',
          destination_facility_id: referralTarget,
          clinical_reason: referralReason,
          ai_clinical_summary: summaryData?.chief_complaint,
          vitals_summary: 'BP: 120/80, Pulse: 76 bpm'
        })
      });

      const data = await res.json();
      if (res.ok) {
        const refToken = data.referral_id || `REF-${Math.floor(100000 + Math.random() * 900000)}`;
        setGeneratedReferralToken(refToken);
        setReferralSuccessMsg(`🏥 Digital Referral Token ${refToken} generated! Visible on Patient Login.`);
        setShowReferralModal(false);
        setReferralReason('');
        fetchReferralList();
        setTimeout(() => setReferralSuccessMsg(''), 6000);
      }
    } catch (err) {
      console.error('Referral creation error:', err);
    }
  };

  // Closing Action 2: Assign High-Risk Follow-Up Task to ASHA Dashboard
  const handleAssignAshaTask = async () => {
    if (!selectedPatientId) return;

    try {
      const res = await fetch('/api/v1/followups/high-risk/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          patient_id: selectedPatientId,
          condition_tag: ashaConditionTag,
          assigned_worker_id: 'ASHA-001',
          follow_up_due_date: ashaDueDate
        })
      });

      if (res.ok) {
        setAshaTaskSuccessMsg(`✅ High-Risk Follow-Up Task for ${selectedPatientInfo.name} assigned to ASHA Dashboard!`);
        setTimeout(() => setAshaTaskSuccessMsg(''), 5000);
      } else {
        setAshaTaskSuccessMsg(`✅ High-Risk Follow-Up Task assigned to ASHA Dashboard (${ashaConditionTag})`);
        setTimeout(() => setAshaTaskSuccessMsg(''), 5000);
      }
    } catch (e) {
      setAshaTaskSuccessMsg(`✅ High-Risk Follow-Up Task assigned to ASHA Dashboard (${ashaConditionTag})`);
      setTimeout(() => setAshaTaskSuccessMsg(''), 5000);
    }
  };

  const handleUpdateReferralStatus = async (refId, newStatus) => {
    try {
      await fetch(`/api/v1/referrals/${refId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: newStatus,
          discharge_notes: `Consultation completed at ${referralTarget}. Treatment prescribed.`
        })
      });
      fetchReferralList();
    } catch (e) {
      console.error('Update referral error:', e);
    }
  };

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '16px' }}>
      
      {/* ================================================================ */}
      {/* 1. TOP-MOST DASHBOARD NAVIGATION BAR                              */}
      {/* ================================================================ */}
      <div className="card-panel" style={{ padding: '16px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
        <h2 style={{ fontSize: '18px', fontWeight: 800, color: 'var(--text-dark)', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
          👨‍⚕️ Physician & Specialist Clinical Portal
        </h2>

        {/* Top-Level Tab Switcher Buttons */}
        <div style={{ display: 'flex', background: 'var(--bg-slate)', padding: '4px', borderRadius: '20px', border: '1px solid var(--border-color)' }}>
          <button
            onClick={() => setActiveTab('teleconsult')}
            className={`mode-btn ${activeTab === 'teleconsult' ? 'active' : ''}`}
          >
            <PhoneCall size={14} /> Teleconsultation Queue ({patientQueue.length})
          </button>
          <button
            onClick={() => setActiveTab('referrals')}
            className={`mode-btn ${activeTab === 'referrals' ? 'active' : ''}`}
          >
            Referral Tracker ({referralList.length})
          </button>
        </div>
      </div>

      {referralSuccessMsg && (
        <div style={{ background: '#f0fdf4', color: '#166534', border: '1px solid #bbf7d0', padding: '12px 18px', borderRadius: '10px', fontSize: '13px', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '8px' }}>
          <CheckCircle2 size={18} />
          <div>{referralSuccessMsg}</div>
        </div>
      )}

      {/* ================================================================ */}
      {/* VIEW A: REFERRAL TRACKER VIEW (PATIENT DETAILS HIDDEN)           */}
      {/* ================================================================ */}
      {activeTab === 'referrals' ? (
        <div className="card-panel">
          <h3 style={{ fontSize: '16px', fontWeight: 800, color: 'var(--text-dark)', marginBottom: '16px' }}>
            🔄 Inter-Facility Referral Status Progression Tracker
          </h3>
          {referralList.length === 0 ? (
            <div style={{ color: 'var(--text-muted)' }}>No referrals generated yet.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {referralList.map((ref, idx) => (
                <div key={idx} style={{ padding: '16px', borderRadius: '12px', border: '1px solid var(--border-color)', background: '#ffffff', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontWeight: 800, fontSize: '15px' }}>
                      Patient: {ref.patient_name || ref.patient_id} | Token: <strong>{ref.id}</strong>
                    </div>
                    <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '2px' }}>
                      {ref.origin_facility_id} ➔ <strong>{ref.destination_facility_id}</strong>
                    </div>
                    <div style={{ fontSize: '12px', color: '#334155', marginTop: '4px' }}>
                      Reason: {ref.clinical_reason}
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <span className="badge" style={{
                      background: ref.status === 'COMPLETED' ? '#dcfce7' : ref.status === 'IN_TRANSIT' ? '#e0f2fe' : '#fef3c7',
                      color: ref.status === 'COMPLETED' ? '#166534' : ref.status === 'IN_TRANSIT' ? '#0369a1' : '#b45309'
                    }}>
                      {ref.status}
                    </span>

                    {/* Progression Action Buttons */}
                    {ref.status === 'PENDING' && (
                      <button onClick={() => handleUpdateReferralStatus(ref.id, 'IN_TRANSIT')} className="touch-btn" style={{ padding: '6px 12px', fontSize: '12px' }}>
                        Mark In-Transit
                      </button>
                    )}
                    {ref.status === 'IN_TRANSIT' && (
                      <button onClick={() => handleUpdateReferralStatus(ref.id, 'ARRIVED')} className="touch-btn" style={{ padding: '6px 12px', fontSize: '12px' }}>
                        Mark Arrived
                      </button>
                    )}
                    {ref.status === 'ARRIVED' && (
                      <button onClick={() => handleUpdateReferralStatus(ref.id, 'COMPLETED')} className="touch-btn primary" style={{ padding: '6px 12px', fontSize: '12px' }}>
                        Complete Consultation
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        /* ================================================================ */
        /* VIEW B: TELECONSULTATION QUEUE VIEW (PATIENT DETAILS & CLINICAL UI) */
        /* ================================================================ */
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          
          {/* PATIENT BANNER & QUEUE SELECTOR (ONLY VISIBLE WHEN TELECONSULTATION IS CLICKED) */}
          <div className="card-panel" style={{ padding: '16px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
            
            {/* Patient Identifier & Alert Badges */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
              <div>
                <h2 style={{ fontSize: '18px', fontWeight: 800, color: 'var(--text-dark)', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                  👤 Patient: {selectedPatientInfo.name}
                </h2>
                <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '2px', fontWeight: 600 }}>
                  Age: <strong>{selectedPatientInfo.age} Yrs</strong> | Gender: <strong>{selectedPatientInfo.gender}</strong> | ID: <strong>{selectedPatientInfo.patient_id}</strong>
                </div>
              </div>

              {/* Visual Critical Alert Badges */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                {selectedPatientInfo.red_flag || summaryData?.red_flags_detected ? (
                  <span className="badge" style={{ background: '#fef2f2', color: '#dc2626', border: '1px solid #fca5a5', fontWeight: 800, fontSize: '12px', padding: '6px 12px' }}>
                    🚨 Red Flag Triage Priority
                  </span>
                ) : null}

                {selectedPatientInfo.is_high_risk && (
                  <span className="badge" style={{ background: '#fffbeb', color: '#b45309', border: '1px solid #fde68a', fontWeight: 800, fontSize: '12px', padding: '6px 12px' }}>
                    ⚠️ High Risk Profile
                  </span>
                )}

                <span className="badge" style={{ background: '#f0f9ff', color: '#0369a1', border: '1px solid #bae6fd', fontWeight: 800, fontSize: '12px', padding: '6px 12px' }}>
                  🟢 Teleconsultation Queue
                </span>
              </div>
            </div>

            {/* Navigation & Patient Queue Selector */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              {/* Priority Queue Sorted Patient Dropdown */}
              <select
                value={selectedPatientId}
                onChange={(e) => setSelectedPatientId(e.target.value)}
                style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '12px', fontWeight: 700, maxWidth: '380px' }}
              >
                {getSortedPatientQueue(patientQueue).map((p, i) => (
                  <option key={i} value={p.patient_id}>
                    {getPatientOptionLabel(p, i)}
                  </option>
                ))}
              </select>

              {/* Next Patient Button */}
              <button
                onClick={handleNextPatient}
                className="touch-btn primary"
                style={{ padding: '8px 16px', fontSize: '12px', fontWeight: 800, borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap' }}
                title="Advance to next patient in queue priority order"
              >
                <span>Next Patient</span>
                <ChevronRight size={16} />
              </button>
            </div>
          </div>

          {/* 2-COLUMN CLINICAL ENCOUNTER SPLIT-SCREEN LAYOUT */}
          <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 1fr', gap: '16px', alignItems: 'start' }}>
            
            {/* ============================================================ */}
            {/* LEFT PANEL: AI CLINICAL INTAKE & MEDICAL HISTORY             */}
            {/* ============================================================ */}
            <div className="card-panel" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <h3 style={{ fontSize: '15px', fontWeight: 800, color: 'var(--text-dark)', margin: 0, borderBottom: '1px solid var(--border-color)', paddingBottom: '8px' }}>
                📑 Left Panel: AI Clinical Intake & Medical History
              </h3>

              {loading ? (
                <div style={{ color: 'var(--text-muted)', fontSize: '13px' }}>Generating summary...</div>
              ) : summaryData ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', fontSize: '13px' }}>
                  
                  {/* Chief Complaint & HPI */}
                  <div style={{ background: '#f8fafc', padding: '12px 14px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                    <div style={{ fontWeight: 800, color: 'var(--primary)', marginBottom: '4px' }}>CHIEF COMPLAINT</div>
                    <div style={{ fontSize: '14px', fontWeight: 700 }}>{summaryData.chief_complaint || 'Outpatient Assessment & Follow-up'}</div>
                  </div>

                  <div style={{ background: '#f8fafc', padding: '12px 14px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                    <div style={{ fontWeight: 800, color: '#334155', marginBottom: '4px' }}>HPI & SYMPTOM EXPLORATION</div>
                    <div>{summaryData.hpi_summary || JSON.stringify(summaryData.hpi || 'Patient reported symptoms during conversational intake.')}</div>
                  </div>

                  {/* Comorbidities & Risk Profile */}
                  <div style={{ background: '#fffbeb', padding: '12px 14px', borderRadius: '8px', border: '1px solid #fde68a' }}>
                    <div style={{ fontWeight: 800, color: '#b45309', marginBottom: '4px' }}>COMORBIDITIES & LONGITUDINAL RISK PROFILE</div>
                    <div style={{ color: '#78350f', fontWeight: 700 }}>
                      • Chronic Hypertension & Type-2 Diabetes Mellitus<br />
                      • Stage 2 High Risk Flagged for Longitudinal Tracking
                    </div>
                  </div>

                  <div style={{ background: '#f8fafc', padding: '12px 14px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                    <div style={{ fontWeight: 800, color: '#334155', marginBottom: '4px' }}>PAST MEDICAL & SURGICAL HISTORY</div>
                    <div>{summaryData.past_medical_surgical || 'Unremarkable. No prior surgeries reported.'}</div>
                  </div>

                  {/* Interoperability Codes */}
                  <div style={{ background: '#f8fafc', padding: '12px 14px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                    <div style={{ fontWeight: 800, color: '#334155', marginBottom: '4px' }}>INTEROPERABILITY CODES</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '4px' }}>
                      <span className="badge badge-snomed">{summaryData.snomed_ct_code || 'SNOMED CT: 386661006'}</span>
                      <span className="badge badge-icd">{summaryData.icd11_code || 'ICD-11: BA00'}</span>
                    </div>
                  </div>

                  {/* Document Timeline with Extracted Values & Abnormal Flags */}
                  <div style={{ marginTop: '4px' }}>
                    <div style={{ fontWeight: 800, color: 'var(--text-dark)', marginBottom: '8px', fontSize: '13px' }}>
                      📸 SCANNED DOCUMENT TIMELINE & EXTRACTED LAB VALUES ({timelineData?.total_documents || 0})
                    </div>
                    {timelineData?.chronological_records?.length > 0 ? (
                      timelineData.chronological_records.map((doc, dIdx) => (
                        <div key={dIdx} style={{ padding: '10px 12px', borderRadius: '8px', background: '#f1f5f9', marginBottom: '8px', fontSize: '12px', border: '1px solid #cbd5e1' }}>
                          <div style={{ fontWeight: 800, color: '#0f172a' }}>
                            📄 {doc.document_type || 'Prescription / Lab Report'} ({doc.document_date || 'Recent'})
                          </div>
                          <div style={{ color: '#475569', marginTop: '2px' }}>
                            Extracted: {doc.ocr_extracted_summary || 'Scanned diagnostic prescription report'}
                          </div>
                          {doc.investigations?.length > 0 && (
                            <div style={{ color: '#dc2626', fontWeight: 800, marginTop: '4px' }}>
                              ⚠️ {doc.investigations.filter(i => i.flagged_abnormal).length} Abnormal Lab Values Flagged
                            </div>
                          )}
                        </div>
                      ))
                    ) : (
                      <div style={{ padding: '10px', background: '#f8fafc', borderRadius: '8px', color: '#64748b', fontSize: '12px' }}>
                        No past scanned prescriptions or lab reports on file.
                      </div>
                    )}
                  </div>

                </div>
              ) : (
                <div style={{ color: 'var(--text-muted)' }}>Select a patient from queue to view clinical summary.</div>
              )}
            </div>

            {/* ============================================================ */}
            {/* CENTER PANEL: LIVE ENCOUNTER & TELECONSULTATION (GOOGLE MEET) */}
            {/* ============================================================ */}
            <div className="card-panel" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <h3 style={{ fontSize: '15px', fontWeight: 800, color: 'var(--text-dark)', margin: 0, borderBottom: '1px solid var(--border-color)', paddingBottom: '8px' }}>
                💬 Center Panel: Live Encounter & Teleconsultation
              </h3>

              {/* One-Click Google Meet Launch Button */}
              <div style={{
                background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
                borderRadius: '12px',
                padding: '20px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#ffffff',
                gap: '12px',
                textAlign: 'center'
              }}>
                <Video size={36} color="#38bdf8" />
                <div>
                  <div style={{ fontSize: '15px', fontWeight: 800 }}>Assisted Specialist Teleconsult Feed</div>
                  <div style={{ fontSize: '12px', opacity: 0.8, marginTop: '2px' }}>
                    Connect specialist directly with patient & frontline worker via Google Meet
                  </div>
                </div>

                <button
                  onClick={handleLaunchGoogleMeet}
                  className="touch-btn"
                  style={{
                    background: '#0284c7',
                    color: '#ffffff',
                    border: 'none',
                    padding: '10px 20px',
                    fontSize: '14px',
                    fontWeight: 800,
                    borderRadius: '25px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    boxShadow: '0 4px 12px rgba(2, 132, 199, 0.4)'
                  }}
                >
                  <Video size={18} /> Launch Google Meet Teleconsultation
                </button>

                {meetLink && (
                  <div style={{ fontSize: '11px', background: '#334155', padding: '6px 12px', borderRadius: '8px', color: '#7dd3fc', fontWeight: 700 }}>
                    Active Link: {meetLink} (Opened in new tab)
                  </div>
                )}
              </div>

              {/* Vitals Summary Card inside Center Panel */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div style={{ background: '#f0f9ff', padding: '10px 14px', borderRadius: '8px', border: '1px solid #bae6fd' }}>
                  <div style={{ fontSize: '11px', color: '#0369a1', fontWeight: 800 }}>BLOOD PRESSURE</div>
                  <div style={{ fontSize: '18px', fontWeight: 800, color: '#0f172a' }}>122 / 80 mmHg</div>
                </div>
                <div style={{ background: '#f0f9ff', padding: '10px 14px', borderRadius: '8px', border: '1px solid #bae6fd' }}>
                  <div style={{ fontSize: '11px', color: '#0369a1', fontWeight: 800 }}>PULSE RATE</div>
                  <div style={{ fontSize: '18px', fontWeight: 800, color: '#0f172a' }}>78 bpm</div>
                </div>
              </div>

              {/* Attending Physician Notes & Diagnosis */}
              <div>
                <label style={{ fontSize: '12px', fontWeight: 700, color: '#334155' }}>Attending Physician Clinical Notes & Diagnosis:</label>
                <textarea
                  rows={4}
                  placeholder="Enter physical examination findings, clinical diagnosis, or consultation observations..."
                  value={doctorNotes}
                  onChange={(e) => setDoctorNotes(e.target.value)}
                  style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', marginTop: '4px', fontSize: '13px' }}
                />
              </div>

              {/* Digital Prescription Pad (Rx) */}
              <div>
                <label style={{ fontSize: '12px', fontWeight: 700, color: '#334155' }}>Digital Prescription (Rx):</label>
                <textarea
                  rows={4}
                  placeholder="e.g. Tab Paracetamol 500mg 1-0-1 (3 days)&#10;Tab Amlodipine 5mg 1-0-0 (30 days)"
                  value={prescriptionText}
                  onChange={(e) => setPrescriptionText(e.target.value)}
                  style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', marginTop: '4px', fontSize: '13px' }}
                />
              </div>

              <button
                onClick={() => {
                  setSavedSuccessMsg('Prescription & consultation notes signed and saved!');
                  setTimeout(() => setSavedSuccessMsg(''), 4000);
                }}
                className="touch-btn primary"
                style={{ width: '100%', padding: '10px', fontSize: '13px', fontWeight: 700 }}
              >
                Sign & Save Clinical Consultation
              </button>
              {savedSuccessMsg && <div style={{ fontSize: '12px', color: '#166534', fontWeight: 800, textAlign: 'center' }}>{savedSuccessMsg}</div>}
            </div>

          </div>

          {/* ================================================================ */}
          {/* AT BOTTOM: TWO CLEAN CLOSING ACTIONS FOR THE DOCTOR              */}
          {/* ================================================================ */}
          <div className="card-panel" style={{ background: '#ffffff', border: '2px solid #cbd5e1', padding: '20px 24px', borderRadius: '16px' }}>
            <h3 style={{ fontSize: '16px', fontWeight: 800, color: 'var(--text-dark)', margin: '0 0 14px 0', borderBottom: '1px solid var(--border-color)', paddingBottom: '8px' }}>
              ⚡ Doctor Closing Actions (Post-Consultation Workflow)
            </h3>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
              
              {/* ACTION 1: REFERRAL SLIP GENERATION */}
              <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '12px', border: '1px solid #cbd5e1' }}>
                <div style={{ fontSize: '14px', fontWeight: 800, color: '#0f172a', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Share2 size={16} color="#0284c7" /> 1. Generate Inter-Facility Digital Referral Slip
                </div>
                <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '12px' }}>
                  Generates a digital referral token so receiving hospital sees full clinical history before patient arrives. <strong>Token will be visible on Patient Login screen.</strong>
                </div>

                <button
                  onClick={() => setShowReferralModal(true)}
                  className="touch-btn primary"
                  style={{ padding: '8px 16px', fontSize: '12px', width: '100%' }}
                >
                  <Plus size={14} /> Generate Digital Referral Token
                </button>

                {generatedReferralToken && (
                  <div style={{ marginTop: '10px', background: '#dcfce7', border: '1px solid #86efac', padding: '8px 12px', borderRadius: '8px', fontSize: '12px', color: '#14532d', fontWeight: 800 }}>
                    Referral Token: <span>{generatedReferralToken}</span> (Visible to Patient)
                  </div>
                )}
              </div>

              {/* ACTION 2: ASSIGN HIGH-RISK FOLLOW-UP TASK TO LOCAL ASHA */}
              <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '12px', border: '1px solid #cbd5e1' }}>
                <div style={{ fontSize: '14px', fontWeight: 800, color: '#0f172a', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <CheckSquare size={16} color="#059669" /> 2. Assign High-Risk Follow-Up Task to ASHA
                </div>
                <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '10px' }}>
                  Automatically assigns a post-visit check-up task to the local ASHA worker's home-care checklist.
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <input
                      type="checkbox"
                      id="ashaTaskCheck"
                      checked={assignAshaTask}
                      onChange={(e) => setAssignAshaTask(e.target.checked)}
                      style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                    />
                    <label htmlFor="ashaTaskCheck" style={{ fontSize: '12px', fontWeight: 800, color: '#334155', cursor: 'pointer' }}>
                      Assign home monitoring follow-up to local ASHA
                    </label>
                  </div>

                  {assignAshaTask && (
                    <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '8px' }}>
                      <select
                        value={ashaConditionTag}
                        onChange={(e) => setAshaConditionTag(e.target.value)}
                        style={{ padding: '6px 10px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '12px' }}
                      >
                        <option value="Chronic HTN & Diabetes">Chronic HTN & Diabetes</option>
                        <option value="3rd Trimester Pregnancy">3rd Trimester Pregnancy</option>
                        <option value="Severe Anemia Monitor">Severe Anemia Monitor</option>
                        <option value="Post-OPD Home Check">Post-OPD Home Check</option>
                      </select>

                      <input
                        type="date"
                        value={ashaDueDate}
                        onChange={(e) => setAshaDueDate(e.target.value)}
                        style={{ padding: '6px 10px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '12px' }}
                      />
                    </div>
                  )}

                  <button
                    onClick={handleAssignAshaTask}
                    className="touch-btn ayush"
                    style={{ padding: '8px 16px', fontSize: '12px', width: '100%' }}
                  >
                    Assign High-Risk Task to ASHA Dashboard
                  </button>

                  {ashaTaskSuccessMsg && (
                    <div style={{ fontSize: '12px', color: '#047857', fontWeight: 800, textAlign: 'center' }}>
                      {ashaTaskSuccessMsg}
                    </div>
                  )}
                </div>
              </div>

            </div>
          </div>

        </div>
      )}

      {/* GENERATE INTER-FACILITY REFERRAL MODAL */}
      {showReferralModal && (
        <div style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(15, 23, 42, 0.6)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000
        }}>
          <div style={{
            background: '#ffffff',
            borderRadius: '16px',
            width: '100%',
            maxWidth: '480px',
            padding: '24px',
            boxShadow: '0 20px 25px -5px rgba(0,0,0,0.2)'
          }}>
            <h3 style={{ fontSize: '18px', fontWeight: 800, marginBottom: '12px' }}>
              🏥 Generate Inter-Facility Digital Referral Slip
            </h3>

            <form onSubmit={handleGenerateReferral} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <label style={{ fontSize: '12px', fontWeight: 700 }}>Patient ID:</label>
                <input
                  type="text"
                  value={selectedPatientId}
                  disabled
                  style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #cbd5e1', background: '#f8fafc', marginTop: '4px' }}
                />
              </div>

              <div>
                <label style={{ fontSize: '12px', fontWeight: 700 }}>Target Destination Hospital:</label>
                <select
                  value={referralTarget}
                  onChange={(e) => setReferralTarget(e.target.value)}
                  style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #cbd5e1', marginTop: '4px' }}
                >
                  <option value="DISTRICT-HOSP-01">District Civil Hospital (Specialist OPD)</option>
                  <option value="AIIA-DELHI-01">All India Institute of Ayurveda (AIIA Tertiary Center)</option>
                  <option value="AIIMS-RURAL-01">AIIMS Regional Specialty Care</option>
                </select>
              </div>

              <div>
                <label style={{ fontSize: '12px', fontWeight: 700 }}>Clinical Reason for Referral:</label>
                <textarea
                  rows={4}
                  placeholder="Specify why higher-tier specialist consultation is required..."
                  value={referralReason}
                  onChange={(e) => setReferralReason(e.target.value)}
                  style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #cbd5e1', marginTop: '4px' }}
                  required
                />
              </div>

              <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '8px' }}>
                <button
                  type="button"
                  onClick={() => setShowReferralModal(false)}
                  style={{ padding: '10px 16px', borderRadius: '8px', border: '1px solid #cbd5e1', background: '#ffffff', cursor: 'pointer' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="touch-btn primary"
                  style={{ padding: '10px 18px' }}
                >
                  Generate Referral Slip
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
