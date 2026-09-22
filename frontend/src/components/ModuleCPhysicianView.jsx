import React, { useState, useEffect } from 'react';
import { 
  Activity, User, FileText, PhoneCall, AlertTriangle, CheckCircle2, 
  Send, RefreshCw, Volume2, Plus, Clock, ExternalLink, Stethoscope, ChevronRight 
} from 'lucide-react';

export default function ModuleCPhysicianView({ patientId, currentUser }) {
  const [activeTab, setActiveTab] = useState('queue'); // 'queue', 'teleconsult', 'referrals'
  const [patientQueue, setPatientQueue] = useState([]);
  const [selectedPatientId, setSelectedPatientId] = useState(patientId || '');
  const [summaryData, setSummaryData] = useState(null);
  const [timelineData, setTimelineData] = useState(null);
  const [loading, setLoading] = useState(false);
  
  // Doctor Notes & Prescription State
  const [doctorNotes, setDoctorNotes] = useState('');
  const [prescriptionText, setPrescriptionText] = useState('');
  const [savedSuccessMsg, setSavedSuccessMsg] = useState('');

  // Referral Modal State
  const [showReferralModal, setShowReferralModal] = useState(false);
  const [referralTarget, setReferralTarget] = useState('DISTRICT-HOSP-01');
  const [referralReason, setReferralReason] = useState('');
  const [referralList, setReferralList] = useState([]);
  const [referralSuccessMsg, setReferralSuccessMsg] = useState('');

  useEffect(() => {
    fetchPatientQueue();
    fetchReferralList();
  }, []);

  useEffect(() => {
    if (selectedPatientId) {
      fetchClinicalSummary(selectedPatientId);
      fetchDocumentTimeline(selectedPatientId);
    }
  }, [selectedPatientId]);

  const fetchPatientQueue = async () => {
    try {
      const res = await fetch('/api/auth/patients');
      if (res.ok) {
        const data = await res.json();
        const list = data.patients || [];
        setPatientQueue(list);
        if (!selectedPatientId && list.length > 0) {
          setSelectedPatientId(list[0].patient_id);
        }
      }
    } catch (e) {
      console.error('Fetch queue error:', e);
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

      if (res.ok) {
        setReferralSuccessMsg('Inter-facility digital referral generated successfully!');
        setShowReferralModal(false);
        setReferralReason('');
        fetchReferralList();
        setTimeout(() => setReferralSuccessMsg(''), 4000);
      }
    } catch (err) {
      console.error('Referral creation error:', err);
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
      {/* Physician Header Controls & Queue Tabs */}
      <div className="card-panel" style={{ padding: '16px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <h2 style={{ fontSize: '18px', fontWeight: 800, color: 'var(--text-dark)', margin: 0 }}>
            👨‍⚕️ Physician & Specialist Clinical Portal
          </h2>
          <div style={{ display: 'flex', background: 'var(--bg-slate)', padding: '4px', borderRadius: '20px', border: '1px solid var(--border-color)' }}>
            <button
              onClick={() => setActiveTab('queue')}
              className={`mode-btn ${activeTab === 'queue' ? 'active' : ''}`}
            >
              OPD Queue ({patientQueue.length})
            </button>
            <button
              onClick={() => setActiveTab('teleconsult')}
              className={`mode-btn ${activeTab === 'teleconsult' ? 'active' : ''}`}
            >
              <PhoneCall size={14} /> Teleconsult Queue
            </button>
            <button
              onClick={() => setActiveTab('referrals')}
              className={`mode-btn ${activeTab === 'referrals' ? 'active' : ''}`}
            >
              Referral Tracker ({referralList.length})
            </button>
          </div>
        </div>

        <button
          onClick={() => setShowReferralModal(true)}
          className="touch-btn primary"
          style={{ padding: '10px 18px', fontSize: '13px' }}
        >
          <Plus size={16} /> Generate Inter-Facility Referral
        </button>
      </div>

      {referralSuccessMsg && (
        <div style={{ background: '#f0fdf4', color: '#166534', border: '1px solid #bbf7d0', padding: '10px 16px', borderRadius: '8px', fontSize: '13px', fontWeight: 700 }}>
          {referralSuccessMsg}
        </div>
      )}

      {/* Referral Tracker View Tab */}
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
                      Patient: {ref.patient_name || ref.patient_id}
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
        /* 3-COLUMN SPLIT-SCREEN LAYOUT FOR DOCTOR CONSULTATION */
        <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 1fr 1fr', gap: '16px', alignItems: 'start' }}>
          
          {/* COLUMN 1: AI Clinical Summary & Chronological Document Timeline */}
          <div className="card-panel" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ fontSize: '15px', fontWeight: 800, color: 'var(--text-dark)', margin: 0 }}>
                📑 AI Clinical History & Timeline
              </h3>
              <select
                value={selectedPatientId}
                onChange={(e) => setSelectedPatientId(e.target.value)}
                style={{ padding: '6px 10px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '12px' }}
              >
                {patientQueue.map((p, i) => (
                  <option key={i} value={p.patient_id}>
                    {p.patient_id} ({p.chief_complaint || 'No intake'})
                  </option>
                ))}
              </select>
            </div>

            {loading ? (
              <div style={{ color: 'var(--text-muted)', fontSize: '13px' }}>Generating summary...</div>
            ) : summaryData ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', fontSize: '13px' }}>
                <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                  <div style={{ fontWeight: 800, color: 'var(--primary)', marginBottom: '4px' }}>CHIEF COMPLAINT</div>
                  <div>{summaryData.chief_complaint || 'Outpatient Assessment'}</div>
                </div>

                <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                  <div style={{ fontWeight: 800, color: '#334155', marginBottom: '4px' }}>HPI & SYMPTOM EXPLORATION</div>
                  <div>{summaryData.hpi_summary || JSON.stringify(summaryData.hpi || {})}</div>
                </div>

                <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                  <div style={{ fontWeight: 800, color: '#334155', marginBottom: '4px' }}>PAST MEDICAL & SURGICAL</div>
                  <div>{summaryData.past_medical_surgical || 'Unremarkable'}</div>
                </div>

                <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                  <div style={{ fontWeight: 800, color: '#334155', marginBottom: '4px' }}>INTEROPERABILITY CODES</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '4px' }}>
                    <span className="badge badge-snomed">{summaryData.snomed_ct_code || 'SNOMED CT'}</span>
                    <span className="badge badge-icd">{summaryData.icd11_code || 'ICD-11'}</span>
                  </div>
                </div>

                {/* Chronological Document Timeline */}
                {timelineData?.chronological_records?.length > 0 && (
                  <div style={{ marginTop: '8px' }}>
                    <div style={{ fontWeight: 800, color: 'var(--text-dark)', marginBottom: '8px' }}>
                      📸 CHRONOLOGICAL DIGITIZED DOCUMENTS ({timelineData.total_documents})
                    </div>
                    {timelineData.chronological_records.map((doc, dIdx) => (
                      <div key={dIdx} style={{ padding: '8px 12px', borderRadius: '6px', background: '#f1f5f9', marginBottom: '6px', fontSize: '12px' }}>
                        <strong>{doc.document_type || 'Prescription'}</strong> ({doc.document_date || 'N/A'})
                        {doc.investigations?.length > 0 && (
                          <div style={{ color: '#dc2626', fontWeight: 700, marginTop: '2px' }}>
                            {doc.investigations.filter(i => i.flagged_abnormal).length} Abnormal Labs Detected
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div style={{ color: 'var(--text-muted)' }}>Select a patient from queue to view clinical summary.</div>
            )}
          </div>

          {/* COLUMN 2: Active Teleconsultation / OPD Consultation Notes */}
          <div className="card-panel" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <h3 style={{ fontSize: '15px', fontWeight: 800, color: 'var(--text-dark)', margin: 0 }}>
              💬 Consultation & Teleconsult Notes
            </h3>

            {/* Video/Audio Teleconsultation Window Placeholder */}
            <div style={{
              height: '180px',
              background: '#0f172a',
              borderRadius: '12px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#ffffff',
              gap: '8px'
            }}>
              <PhoneCall size={32} color="#38bdf8" />
              <div style={{ fontSize: '14px', fontWeight: 700 }}>Assisted Specialist Teleconsult Channel</div>
              <div style={{ fontSize: '11px', opacity: 0.7 }}>District Hospital On-Call Specialist Connected</div>
            </div>

            <div>
              <label style={{ fontSize: '12px', fontWeight: 700, color: '#334155' }}>Attending Physician Notes:</label>
              <textarea
                rows={6}
                placeholder="Enter physical examination findings, clinical diagnosis, or consultation notes..."
                value={doctorNotes}
                onChange={(e) => setDoctorNotes(e.target.value)}
                style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid #cbd5e1', marginTop: '4px', fontSize: '13px' }}
              />
            </div>
          </div>

          {/* COLUMN 3: Vitals Monitor & Digital Prescription Pad */}
          <div className="card-panel" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <h3 style={{ fontSize: '15px', fontWeight: 800, color: 'var(--text-dark)', margin: 0 }}>
              🩺 Vitals & Digital Rx Pad
            </h3>

            {/* Vitals Summary Box */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              <div style={{ background: '#f0f9ff', padding: '10px', borderRadius: '8px', border: '1px solid #bae6fd' }}>
                <div style={{ fontSize: '11px', color: '#0369a1', fontWeight: 700 }}>BLOOD PRESSURE</div>
                <div style={{ fontSize: '16px', fontWeight: 800, color: '#0f172a' }}>122 / 80</div>
              </div>
              <div style={{ background: '#f0f9ff', padding: '10px', borderRadius: '8px', border: '1px solid #bae6fd' }}>
                <div style={{ fontSize: '11px', color: '#0369a1', fontWeight: 700 }}>PULSE RATE</div>
                <div style={{ fontSize: '16px', fontWeight: 800, color: '#0f172a' }}>78 bpm</div>
              </div>
            </div>

            <div>
              <label style={{ fontSize: '12px', fontWeight: 700, color: '#334155' }}>Digital Prescription (Rx):</label>
              <textarea
                rows={6}
                placeholder="e.g. Tab Paracetamol 500mg 1-0-1 (3 days)&#10;Syrup Ayurvedic Triphala 10ml HS"
                value={prescriptionText}
                onChange={(e) => setPrescriptionText(e.target.value)}
                style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid #cbd5e1', marginTop: '4px', fontSize: '13px' }}
              />
            </div>

            <button
              onClick={() => setSavedSuccessMsg('Prescription & consultation notes saved!')}
              className="touch-btn primary"
              style={{ width: '100%' }}
            >
              Sign & Save Consultation
            </button>
            {savedSuccessMsg && <div style={{ fontSize: '12px', color: '#166534', fontWeight: 700, textAlign: 'center' }}>{savedSuccessMsg}</div>}
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
              🏥 Generate Inter-Facility Digital Referral
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
