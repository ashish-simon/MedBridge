import React, { useState, useEffect, useRef } from 'react';
import { Activity, Check, Edit3, X, Printer, ShieldCheck, Tag, FileCheck, Layers, AlertCircle, Volume2, Sparkles, RefreshCw, Search, UserCheck, AlertTriangle } from 'lucide-react';

export default function ModuleCPhysicianView({ patientId, currentUser }) {
  const [patientQueue, setPatientQueue] = useState([]);
  const [selectedPatientId, setSelectedPatientId] = useState(patientId || '');
  const [summaryData, setSummaryData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [queueLoading, setQueueLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [reviewStatus, setReviewStatus] = useState('pending'); // 'pending', 'accepted', 'amended', 'rejected'
  const [sessionCleared, setSessionCleared] = useState(false);
  const [audioPlaying, setAudioPlaying] = useState(false);

  // Editable Form State
  const [editedComplaint, setEditedComplaint] = useState('');
  const [editedHpiOnset, setEditedHpiOnset] = useState('');
  const [editedHpiCharacter, setEditedHpiCharacter] = useState('');
  const [editedPmh, setEditedPmh] = useState('');
  const [editedAllergies, setEditedAllergies] = useState('');
  const [editedPhysicianNotes, setEditedPhysicianNotes] = useState('');

  const audioRef = useRef(null);

  useEffect(() => {
    fetchPatientQueue();
  }, []);

  useEffect(() => {
    if (selectedPatientId) {
      fetchModuleCOutput(selectedPatientId);
    }
  }, [selectedPatientId]);

  const fetchPatientQueue = async () => {
    setQueueLoading(true);
    try {
      const res = await fetch('/api/auth/patients');
      if (res.ok) {
        const data = await res.json();
        setPatientQueue(data.patients || []);
        if (!selectedPatientId && data.patients && data.patients.length > 0) {
          setSelectedPatientId(data.patients[0].patient_id);
        }
      }
    } catch (e) {
      console.error('Failed to fetch patient queue:', e);
    } finally {
      setQueueLoading(false);
    }
  };

  const fetchModuleCOutput = async (pid) => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/module-c/summary/${pid}`);
      if (res.ok) {
        const data = await res.json();
        setSummaryData(data);
        populateEditState(data);
      } else {
        setSummaryData(null);
      }
    } catch (e) {
      console.error("Module C summary fetch error:", e);
      setSummaryData(null);
    } finally {
      setIsLoading(false);
    }
  };

  const populateEditState = (data) => {
    if (!data) return;
    setEditedComplaint(data.chief_complaint || '');
    setEditedHpiOnset(data.hpi?.onset || '');
    setEditedHpiCharacter(data.hpi?.character || '');
    setEditedPmh(data.past_medical_surgical || '');
    setEditedAllergies(data.drug_allergy || '');
    setEditedPhysicianNotes(data.physician_action?.physician_notes || '');
  };

  const handleToggleAudioNarration = async () => {
    if (audioPlaying) {
      if (audioRef.current) {
        try { audioRef.current.pause(); } catch (e) {}
      }
      setAudioPlaying(false);
      return;
    }

    if (summaryData?.audio_base64) {
      try {
        const audioUrl = `data:audio/mp3;base64,${summaryData.audio_base64}`;
        if (!audioRef.current) {
          audioRef.current = new Audio(audioUrl);
        } else {
          audioRef.current.src = audioUrl;
        }
        audioRef.current.onended = () => setAudioPlaying(false);
        await audioRef.current.play();
        setAudioPlaying(true);
      } catch (err) {
        console.error("Audio playback failed:", err);
      }
    }
  };

  const handleSaveAmendment = async () => {
    if (!summaryData) return;
    const updated = {
      ...summaryData,
      chief_complaint: editedComplaint,
      past_medical_surgical: editedPmh,
      drug_allergy: editedAllergies,
      physician_action: {
        status: 'amended',
        physician_notes: editedPhysicianNotes,
        timestamp: new Date().toISOString()
      }
    };
    setSummaryData(updated);
    setReviewStatus('amended');
    setIsEditing(false);
  };

  const handleSignOff = (status) => {
    setReviewStatus(status);
    if (status === 'accepted') setSessionCleared(true);
  };

  const filteredQueue = patientQueue.filter(p => 
    p.patient_id.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.chief_complaint.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: '20px', alignItems: 'start' }}>
      {/* Sidebar: OPD Patient Queue */}
      <div style={{
        background: '#ffffff',
        borderRadius: 'var(--radius-lg)',
        border: '1px solid var(--border-color)',
        boxShadow: 'var(--shadow-sm)',
        padding: '16px',
        maxHeight: 'calc(100vh - 120px)',
        overflowY: 'auto'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
          <h3 style={{ fontSize: '15px', fontWeight: 800, color: 'var(--text-dark)', margin: 0, display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Activity size={18} color="var(--primary)" />
            OPD Patient Queue ({patientQueue.length})
          </h3>
          <button
            type="button"
            className="touch-btn"
            style={{ padding: '6px 10px', fontSize: '12px' }}
            onClick={fetchPatientQueue}
            title="Refresh Patient Queue"
          >
            <RefreshCw size={14} className={queueLoading ? 'spin' : ''} />
          </button>
        </div>

        {/* Queue Search Input */}
        <div style={{ position: 'relative', marginBottom: '14px' }}>
          <Search size={16} color="var(--text-muted)" style={{ position: 'absolute', left: '10px', top: '10px' }} />
          <input
            type="text"
            placeholder="Search Patient ID or Symptom..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{
              width: '100%',
              padding: '8px 10px 8px 32px',
              borderRadius: '6px',
              border: '1px solid var(--border-color)',
              fontSize: '13px',
              boxSizing: 'border-box'
            }}
          />
        </div>

        {/* Patient Queue List */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {queueLoading && patientQueue.length === 0 ? (
            <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
              Loading patient queue...
            </div>
          ) : filteredQueue.length > 0 ? (
            filteredQueue.map(p => {
              const isSelected = p.patient_id === selectedPatientId;
              return (
                <div
                  key={p.patient_id}
                  onClick={() => setSelectedPatientId(p.patient_id)}
                  style={{
                    padding: '12px',
                    borderRadius: '8px',
                    border: isSelected ? '2px solid var(--primary)' : '1px solid var(--border-color)',
                    background: isSelected ? 'var(--primary-light)' : '#ffffff',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                    <span style={{ fontWeight: 800, fontSize: '13px', color: 'var(--primary-dark)', fontFamily: 'monospace' }}>
                      {p.patient_id}
                    </span>
                    {p.red_flag_detected && (
                      <span style={{ background: 'var(--danger-light)', color: 'var(--danger)', padding: '2px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '2px' }}>
                        <AlertTriangle size={10} /> RED FLAG
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--text-dark)', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {p.chief_complaint}
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px', display: 'flex', justifyContent: 'space-between' }}>
                    <span>Docs: {p.doc_count}</span>
                    <span>{p.has_summary ? '✓ Summarized' : 'In Progress'}</span>
                  </div>
                </div>
              );
            })
          ) : (
            <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
              No active patients found in OPD queue.
            </div>
          )}
        </div>
      </div>

      {/* Main Physician Summary Workspace */}
      <div style={{
        background: '#ffffff',
        borderRadius: 'var(--radius-lg)',
        border: '1px solid var(--border-color)',
        boxShadow: 'var(--shadow-sm)',
        padding: '24px'
      }}>
        {/* Workspace Banner */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', borderBottom: '1px solid var(--border-color)', paddingBottom: '14px' }}>
          <div>
            <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Physician Consultation Dashboard
            </div>
            <h2 style={{ fontSize: '22px', fontWeight: 800, color: 'var(--text-dark)', margin: '2px 0 0 0' }}>
              Structured History & Interoperability Summary
            </h2>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            {selectedPatientId && (
              <span className="session-badge" style={{ fontSize: '13px' }}>
                <ShieldCheck size={14} style={{ marginRight: 4, display: 'inline' }} />
                Patient ID: {selectedPatientId}
              </span>
            )}
            <button
              type="button"
              className="touch-btn"
              style={{ padding: '8px 14px', fontSize: '13px' }}
              onClick={() => fetchModuleCOutput(selectedPatientId)}
            >
              <RefreshCw size={14} className={isLoading ? 'spin' : ''} />
              Re-Synthesize
            </button>
          </div>
        </div>

        {/* Render Summary or Empty State */}
        {isLoading ? (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
            <Activity size={36} className="spin" style={{ marginBottom: '12px', color: 'var(--primary)' }} />
            <div>Synthesizing patient history & document intelligence...</div>
          </div>
        ) : summaryData ? (
          <div>
            {/* Header Audio & Verification Bar */}
            <div style={{
              background: 'var(--bg-slate)',
              padding: '12px 16px',
              borderRadius: 'var(--radius-md)',
              display: 'flex',
              justify: 'space-between',
              alignItems: 'center',
              marginBottom: '20px',
              border: '1px solid var(--border-color)'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <button
                  type="button"
                  className="touch-btn primary"
                  style={{ padding: '8px 14px', fontSize: '13px' }}
                  onClick={handleToggleAudioNarration}
                >
                  <Volume2 size={16} />
                  {audioPlaying ? 'Pause Audio Summary' : 'Listen to Audio Summary'}
                </button>
                <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                  Language: {summaryData.summary_language?.toUpperCase() || 'EN'}
                </span>
              </div>

              <div style={{ display: 'flex', gap: '10px' }}>
                <button
                  className={`touch-btn ${reviewStatus === 'accepted' ? 'primary' : ''}`}
                  style={{ padding: '8px 14px', fontSize: '13px' }}
                  onClick={() => handleSignOff('accepted')}
                >
                  <Check size={16} /> Accept Summary
                </button>

                <button
                  className="touch-btn"
                  style={{ padding: '8px 14px', fontSize: '13px' }}
                  onClick={() => setIsEditing(!isEditing)}
                >
                  <Edit3 size={16} /> {isEditing ? 'Cancel Edits' : 'Amend History'}
                </button>

                <button
                  className="touch-btn danger"
                  style={{ padding: '8px 14px', fontSize: '13px' }}
                  onClick={() => handleSignOff('rejected')}
                >
                  <X size={16} /> Reject
                </button>
              </div>
            </div>

            {/* Red Flag Emergency Banner if detected */}
            {summaryData.red_flag_detected && (
              <div style={{
                background: 'var(--danger-light)',
                color: 'var(--danger)',
                padding: '14px',
                borderRadius: 'var(--radius-md)',
                marginBottom: '20px',
                border: '1px solid var(--danger)',
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                gap: '10px'
              }}>
                <AlertCircle size={22} />
                <div>
                  <strong>TRIAGE ALERT — RED FLAG DETECTED:</strong> {summaryData.red_flag_reason || 'Immediate priority consultation required.'}
                </div>
              </div>
            )}

            {/* Standard Clinical Format Breakdown */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

              {/* Section 1: Chief Complaint */}
              <div style={{ background: 'var(--bg-slate)', padding: '14px', borderRadius: 'var(--radius-md)' }}>
                <label style={{ fontSize: '12px', fontWeight: 800, color: 'var(--primary-dark)', textTransform: 'uppercase', display: 'block', marginBottom: '6px' }}>
                  1. Chief Complaint:
                </label>
                {isEditing ? (
                  <input
                    type="text"
                    value={editedComplaint}
                    onChange={(e) => setEditedComplaint(e.target.value)}
                    style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid var(--border-color)' }}
                  />
                ) : (
                  <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-dark)' }}>
                    {summaryData.chief_complaint}
                  </div>
                )}
              </div>

              {/* Section 2: HPI */}
              <div style={{ background: 'var(--bg-slate)', padding: '14px', borderRadius: 'var(--radius-md)' }}>
                <label style={{ fontSize: '12px', fontWeight: 800, color: 'var(--primary-dark)', textTransform: 'uppercase', display: 'block', marginBottom: '6px' }}>
                  2. History of Present Illness (HPI / SOCRATES & AYUSH):
                </label>
                <div style={{ fontSize: '14px', color: 'var(--text-dark)', lineHeight: '1.5' }}>
                  {typeof summaryData.hpi === 'object' ? (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '8px', marginTop: '6px' }}>
                      {Object.entries(summaryData.hpi).map(([k, v]) => v && (
                        <div key={k} style={{ background: '#fff', padding: '6px 10px', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
                          <span style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'capitalize', display: 'block' }}>{k.replace('_', ' ')}</span>
                          <strong>{typeof v === 'object' ? v.value || JSON.stringify(v) : str(v)}</strong>
                        </div>
                      ))}
                    </div>
                  ) : (
                    summaryData.hpi
                  )}
                </div>
              </div>

              {/* Section 3 & 4: Medical/Surgical History & Drug/Allergy */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div style={{ background: 'var(--bg-slate)', padding: '14px', borderRadius: 'var(--radius-md)' }}>
                  <label style={{ fontSize: '12px', fontWeight: 800, color: 'var(--primary-dark)', textTransform: 'uppercase', display: 'block', marginBottom: '6px' }}>
                    3. Past Medical & Surgical History:
                  </label>
                  {isEditing ? (
                    <textarea
                      value={editedPmh}
                      onChange={(e) => setEditedPmh(e.target.value)}
                      rows={3}
                      style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid var(--border-color)' }}
                    />
                  ) : (
                    <div style={{ fontSize: '13px', color: 'var(--text-dark)' }}>
                      {summaryData.past_medical_surgical || 'No past medical or surgical conditions declared'}
                    </div>
                  )}
                </div>

                <div style={{ background: 'var(--bg-slate)', padding: '14px', borderRadius: 'var(--radius-md)' }}>
                  <label style={{ fontSize: '12px', fontWeight: 800, color: 'var(--primary-dark)', textTransform: 'uppercase', display: 'block', marginBottom: '6px' }}>
                    4. Drug Allergies & Current Medications:
                  </label>
                  {isEditing ? (
                    <textarea
                      value={editedAllergies}
                      onChange={(e) => setEditedAllergies(e.target.value)}
                      rows={3}
                      style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid var(--border-color)' }}
                    />
                  ) : (
                    <div style={{ fontSize: '13px', color: 'var(--text-dark)' }}>
                      {summaryData.drug_allergy || 'No known drug allergies reported'}
                    </div>
                  )}
                </div>
              </div>

              {/* Section 5 & 6: Family/Personal & ROS */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div style={{ background: 'var(--bg-slate)', padding: '14px', borderRadius: 'var(--radius-md)' }}>
                  <label style={{ fontSize: '12px', fontWeight: 800, color: 'var(--primary-dark)', textTransform: 'uppercase', display: 'block', marginBottom: '6px' }}>
                    5. Family & Personal Lifestyle History:
                  </label>
                  <div style={{ fontSize: '13px', color: 'var(--text-dark)' }}>
                    <div><strong>Family:</strong> {summaryData.family_history || 'None reported'}</div>
                    <div style={{ marginTop: '4px' }}><strong>Personal/Diet:</strong> {summaryData.personal_history || 'Unremarkable'}</div>
                  </div>
                </div>

                <div style={{ background: 'var(--bg-slate)', padding: '14px', borderRadius: 'var(--radius-md)' }}>
                  <label style={{ fontSize: '12px', fontWeight: 800, color: 'var(--primary-dark)', textTransform: 'uppercase', display: 'block', marginBottom: '6px' }}>
                    6. Review of Systems (ROS):
                  </label>
                  <div style={{ fontSize: '13px', color: 'var(--text-dark)' }}>
                    {summaryData.review_of_systems || 'Unremarkable.'}
                  </div>
                </div>
              </div>

              {/* Section 7: Prior Investigations Summary */}
              <div style={{ background: 'var(--bg-slate)', padding: '14px', borderRadius: 'var(--radius-md)' }}>
                <label style={{ fontSize: '12px', fontWeight: 800, color: 'var(--primary-dark)', textTransform: 'uppercase', display: 'block', marginBottom: '6px' }}>
                  7. Prior Investigations & Digitized Lab Summary:
                </label>
                <div style={{ fontSize: '13px', color: 'var(--text-dark)' }}>
                  {summaryData.prior_investigations_summary || 'No prior lab reports attached'}
                </div>
              </div>

              {/* Dynamic Interoperability Coding Section (SNOMED, ICD-11, LOINC, NAMASTE) */}
              {summaryData.coding && (
                <div style={{
                  background: 'var(--primary-light)',
                  border: '1px solid var(--primary-border)',
                  borderRadius: 'var(--radius-md)',
                  padding: '16px'
                }}>
                  <h4 style={{ fontSize: '13px', fontWeight: 800, color: 'var(--primary-dark)', textTransform: 'uppercase', margin: '0 0 10px 0', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Tag size={16} /> ABDM & Ayush Interoperability Coding Standards:
                  </h4>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '10px' }}>
                    {summaryData.coding.snomed_ct && (
                      <div style={{ background: '#fff', padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
                        <span style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', fontWeight: 700 }}>SNOMED-CT Code:</span>
                        <strong style={{ color: 'var(--primary-dark)' }}>{summaryData.coding.snomed_ct}</strong>
                      </div>
                    )}

                    {summaryData.coding.icd_11 && (
                      <div style={{ background: '#fff', padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
                        <span style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', fontWeight: 700 }}>ICD-11 Code:</span>
                        <strong style={{ color: 'var(--primary-dark)' }}>{summaryData.coding.icd_11}</strong>
                      </div>
                    )}

                    {summaryData.coding.loinc && (
                      <div style={{ background: '#fff', padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
                        <span style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', fontWeight: 700 }}>LOINC Code:</span>
                        <strong style={{ color: 'var(--primary-dark)' }}>{summaryData.coding.loinc}</strong>
                      </div>
                    )}

                    {summaryData.coding.namaste && (
                      <div style={{ background: '#fff', padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
                        <span style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', fontWeight: 700 }}>NAMASTE Portal Code:</span>
                        <strong style={{ color: 'var(--ayush-teal)' }}>{summaryData.coding.namaste}</strong>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Amendment Action Button if in editing mode */}
              {isEditing && (
                <div style={{ marginTop: '14px', background: 'var(--warning-light)', padding: '14px', borderRadius: 'var(--radius-md)', border: '1px solid var(--warning)' }}>
                  <h4 style={{ fontSize: '13px', fontWeight: 800, color: 'var(--warning)', margin: '0 0 8px 0' }}>Physician Inline Amendment Notes:</h4>
                  <textarea
                    value={editedPhysicianNotes}
                    onChange={(e) => setEditedPhysicianNotes(e.target.value)}
                    placeholder="Enter clinical amendment rationale..."
                    rows={2}
                    style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid var(--border-color)', marginBottom: '10px' }}
                  />
                  <button
                    className="touch-btn primary"
                    style={{ width: '100%', padding: '10px', fontSize: '14px' }}
                    onClick={handleSaveAmendment}
                  >
                    Save Physician Amendments & Sign Off
                  </button>
                </div>
              )}

            </div>
          </div>
        ) : (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
            <FileCheck size={36} style={{ marginBottom: '12px', opacity: 0.5 }} />
            <div>No completed intake history found for Patient ID: <strong>{selectedPatientId}</strong>.</div>
            <div style={{ fontSize: '12px', marginTop: '6px' }}>Select an active patient from the OPD queue on the left to view their synthesized summary.</div>
          </div>
        )}
      </div>
    </div>
  );
}
