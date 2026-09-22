import React, { useState, useEffect } from 'react';
import { CheckCircle2, ShieldCheck, RefreshCw, LogOut, FileText, Activity, ChevronDown, ChevronUp, Sparkles, AlertTriangle } from 'lucide-react';

export default function KioskComplete({ patientId, onStartOver, onLogout }) {
  const [showDetails, setShowDetails] = useState(false);
  const [patientSummary, setPatientSummary] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchPatientSummary();
  }, [patientId]);

  const fetchPatientSummary = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/module-c/summary/${patientId}`);
      if (res.ok) {
        const data = await res.json();
        setPatientSummary(data);
      }
    } catch (e) {
      console.error('Failed to fetch patient summary:', e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      maxWidth: '800px',
      margin: '20px auto',
      background: '#ffffff',
      borderRadius: '16px',
      boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.05), 0 8px 10px -6px rgba(0, 0, 0, 0.01)',
      border: '1px solid var(--border-color)',
      padding: '36px 32px',
      textAlign: 'center'
    }}>
      {/* Big Success Icon */}
      <div style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: '80px',
        height: '80px',
        borderRadius: '50%',
        background: 'var(--success-light)',
        color: 'var(--success)',
        marginBottom: '20px'
      }}>
        <CheckCircle2 size={48} />
      </div>

      <h2 style={{ fontSize: '26px', fontWeight: 800, color: 'var(--text-dark)', marginBottom: '8px' }}>
        OPD Clinical Intake Completed
      </h2>

      <p style={{ fontSize: '15px', color: 'var(--text-muted)', maxWidth: '580px', margin: '0 auto 24px auto', lineHeight: '1.5' }}>
        Thank you! Your intake responses and digitized medical documents have been compiled and sent directly to the physician's OPD consultation queue.
      </p>

      {/* Patient Queue Status Card */}
      <div style={{
        background: 'var(--bg-slate)',
        borderRadius: '12px',
        border: '1px solid var(--border-color)',
        padding: '20px',
        textAlign: 'left',
        marginBottom: '28px'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', borderBottom: '1px solid var(--border-color)', paddingBottom: '10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <ShieldCheck size={20} color="var(--primary)" />
            <strong style={{ fontSize: '14px', color: 'var(--text-dark)' }}>Patient Session ID:</strong>
            <span style={{ fontFamily: 'monospace', fontWeight: 700, color: 'var(--primary-dark)', background: '#fff', padding: '2px 8px', borderRadius: '4px', border: '1px solid var(--border-color)' }}>
              {patientId}
            </span>
          </div>
          <span style={{ background: 'var(--success-light)', color: 'var(--success)', padding: '4px 12px', borderRadius: '12px', fontSize: '12px', fontWeight: 800 }}>
            TRANSMITTED TO PHYSICIAN QUEUE
          </span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', fontSize: '13px' }}>
          <div>
            <span style={{ color: 'var(--text-muted)', display: 'block', fontSize: '11px', textTransform: 'uppercase', fontWeight: 700 }}>Recorded Chief Complaint:</span>
            <strong style={{ color: 'var(--text-dark)', fontSize: '14px' }}>
              {patientSummary?.chief_complaint || 'Completed Clinical Interview'}
            </strong>
          </div>

          <div>
            <span style={{ color: 'var(--text-muted)', display: 'block', fontSize: '11px', textTransform: 'uppercase', fontWeight: 700 }}>Synthesized Status:</span>
            <strong style={{ color: 'var(--primary-dark)', fontSize: '14px' }}>
              Ready for Physician Review
            </strong>
          </div>
        </div>
      </div>

      {/* Accordion Toggle for Detailed Summary View */}
      <div style={{ marginBottom: '28px' }}>
        <button
          type="button"
          className="touch-btn"
          style={{ width: '100%', padding: '12px 18px', fontSize: '14px', justifyContent: 'space-between' }}
          onClick={() => setShowDetails(!showDetails)}
        >
          <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <FileText size={18} color="var(--primary)" />
            {showDetails ? 'Hide My Intake Summary' : 'View My Submitted Summary & Records'}
          </span>
          {showDetails ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
        </button>

        {showDetails && (
          <div style={{
            marginTop: '12px',
            padding: '20px',
            background: '#ffffff',
            borderRadius: '12px',
            border: '1px solid var(--border-color)',
            textAlign: 'left',
            fontSize: '13px'
          }}>
            {loading ? (
              <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '20px' }}>Loading summary details...</div>
            ) : patientSummary ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div>
                  <strong>1. Chief Complaint:</strong> {patientSummary.chief_complaint}
                </div>
                <div>
                  <strong>2. History of Present Illness (HPI):</strong>
                  <div style={{ color: 'var(--text-muted)', marginTop: '2px' }}>
                    {typeof patientSummary.hpi === 'object' ? JSON.stringify(patientSummary.hpi) : patientSummary.hpi}
                  </div>
                </div>
                <div>
                  <strong>3. Past Medical & Surgical History:</strong> {patientSummary.past_medical_surgical || 'None reported'}
                </div>
                <div>
                  <strong>4. Allergies & Medications:</strong> {patientSummary.drug_allergy || 'No allergies reported'}
                </div>
                <div>
                  <strong>5. Prior Investigations & Lab Summary:</strong> {patientSummary.prior_investigations_summary || 'No records attached'}
                </div>
              </div>
            ) : (
              <div style={{ color: 'var(--text-muted)' }}>No detailed summary available.</div>
            )}
          </div>
        )}
      </div>

      {/* Action Buttons: Start Over / New Patient vs Logout */}
      <div style={{ display: 'flex', gap: '16px', justifyContent: 'center', flexWrap: 'wrap' }}>
        <button
          className="touch-btn primary"
          style={{ padding: '14px 28px', fontSize: '16px', fontWeight: 700 }}
          onClick={onStartOver}
        >
          <RefreshCw size={20} />
          Start Kiosk for Next Patient →
        </button>

        <button
          className="touch-btn"
          style={{ padding: '14px 24px', fontSize: '15px' }}
          onClick={onLogout}
        >
          <LogOut size={18} />
          Log Out
        </button>
      </div>
    </div>
  );
}
