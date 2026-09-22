import React, { useState, useEffect } from 'react';
import { FileText, Upload, Eye, Sparkles, Calendar, Layers, Activity, CheckCircle2, AlertCircle } from 'lucide-react';

export default function ModuleBDocuments({ patientId, onNext }) {
  const [timelineData, setTimelineData] = useState({
    total_documents: 0,
    chronological_records: [],
    correlated_summary: { all_diagnoses: [], all_medications: [], all_investigations: [] }
  });
  const [isProcessing, setIsProcessing] = useState(false);
  const [uploadProgress, setUploadProgress] = useState('');
  const [errorMsg, setErrorMsg] = useState(null);

  useEffect(() => {
    fetchTimeline();
  }, [patientId]);

  const fetchTimeline = async () => {
    try {
      const res = await fetch(`/api/module-b/timeline?patient_id=${patientId || 'default-patient'}`);
      if (res.ok) {
        const data = await res.json();
        setTimelineData(data);
      }
    } catch (err) {
      console.error('Failed to fetch patient document timeline:', err);
    }
  };

  const handleFileUpload = async (event) => {
    const files = Array.from(event.target.files || []);
    if (files.length === 0) return;

    setIsProcessing(true);
    setErrorMsg(null);
    setUploadProgress(`Scanning ${files.length} medical document(s) with Gemini Vision...`);

    try {
      const formData = new FormData();
      files.forEach(file => {
        formData.append('files', file);
      });

      const res = await fetch(`/api/module-b/extract-multiple?patient_id=${patientId || 'default-patient'}`, {
        method: 'POST',
        body: formData
      });

      if (res.ok) {
        await fetchTimeline();
      } else {
        const errJson = await res.json().catch(() => ({}));
        setErrorMsg(errJson.detail || 'Failed to process document(s). Please try again.');
      }
    } catch (err) {
      console.error('File upload error:', err);
      setErrorMsg('Could not connect to document processing backend.');
    } finally {
      setIsProcessing(false);
      setUploadProgress('');
      event.target.value = '';
    }
  };

  const { chronological_records = [], correlated_summary = {}, total_documents = 0 } = timelineData;
  const { all_diagnoses = [], all_medications = [], all_investigations = [] } = correlated_summary;

  return (
    <div style={{ maxWidth: '960px', margin: '0 auto', width: '100%' }}>
      {/* Module Title Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <div>
          <h2 style={{ fontSize: '22px', fontWeight: 800, color: 'var(--text-dark)' }}>Medical Document Digitization & OCR</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '13px', marginTop: '2px' }}>
            Upload single or multiple medical prescriptions and lab reports to automatically extract diagnoses, medications, and lab test results into a chronological timeline.
          </p>
        </div>

        {onNext && (
          <button 
            className="touch-btn primary"
            style={{ padding: '10px 20px', fontSize: '14px' }}
            onClick={onNext}
          >
            Proceed to Physician Summary →
          </button>
        )}
      </div>

      {/* Upload Card Section */}
      <div className="card-panel" style={{ marginBottom: '24px' }}>
        <div style={{ textAlign: 'center', padding: '16px 0' }}>
          <h3 style={{ fontSize: '16px', fontWeight: 700, marginBottom: '8px' }}>Upload Medical Documents (Select One or Multiple Files):</h3>
          <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '16px' }}>
            Supports prescriptions, lab reports & discharge summaries (.png, .jpg, .jpeg, .webp, .bmp)
          </p>

          <label className="touch-btn primary" style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '14px 28px', fontSize: '16px', fontWeight: 700, cursor: 'pointer' }}>
            <Upload size={22} />
            Choose File(s) to Upload & Scan
            <input 
              type="file" 
              accept="image/*" 
              multiple 
              onChange={handleFileUpload} 
              style={{ display: 'none' }} 
            />
          </label>
        </div>
      </div>

      {/* Processing Indicator */}
      {isProcessing && (
        <div className="card-panel" style={{ textAlign: 'center', padding: '36px', marginBottom: '24px' }}>
          <div className="brand-icon spin" style={{ margin: '0 auto 16px', background: 'var(--primary)' }}>
            ⚡
          </div>
          <h3 style={{ fontSize: '18px', fontWeight: 700 }}>{uploadProgress || 'Processing Documents...'}</h3>
          <p style={{ color: 'var(--text-muted)', fontSize: '14px', marginTop: '6px' }}>
            Running Gemini Vision multimodal OCR & structuring medical findings across files.
          </p>
        </div>
      )}

      {/* Error Banner */}
      {errorMsg && (
        <div style={{ background: 'var(--danger-light)', borderLeft: '4px solid var(--danger)', padding: '12px 16px', borderRadius: '8px', color: 'var(--danger)', fontWeight: 600, fontSize: '14px', marginBottom: '20px' }}>
          ⚠️ {errorMsg}
        </div>
      )}

      {/* Correlated Aggregate Summary Box */}
      {total_documents > 0 && (
        <div className="card-panel" style={{ marginBottom: '24px', background: '#f8fafc', border: '1.5px solid #cbd5e1' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px', borderBottom: '1.5px solid #e2e8f0', paddingBottom: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: 'var(--primary-dark)', fontSize: '16px', fontWeight: 800 }}>
              <Layers size={22} color="#0284c7" />
              Correlated Patient Clinical Summary ({total_documents} Document{total_documents > 1 ? 's' : ''} Analyzed)
            </div>
            <span className="badge badge-snomed" style={{ fontSize: '12px', padding: '4px 10px' }}>Aggregated & Correlated</span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '16px' }}>
            {/* Correlated Diagnoses */}
            <div style={{ background: '#ffffff', padding: '14px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}>
              <div style={{ fontSize: '13px', fontWeight: 800, color: 'var(--primary-dark)', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Activity size={16} />
                Combined Diagnoses Across Records:
              </div>
              {all_diagnoses.length > 0 ? (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                  {all_diagnoses.map((d, i) => (
                    <span key={i} style={{ background: '#e0f2fe', color: '#0369a1', padding: '4px 10px', borderRadius: '12px', fontSize: '13px', fontWeight: 700 }}>
                      {d}
                    </span>
                  ))}
                </div>
              ) : (
                <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>No explicit diagnoses recorded.</span>
              )}
            </div>

            {/* Consolidated Medications */}
            <div style={{ background: '#ffffff', padding: '14px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}>
              <div style={{ fontSize: '13px', fontWeight: 800, color: 'var(--primary-dark)', marginBottom: '8px' }}>
                💊 Consolidated Medication History:
              </div>
              {all_medications.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {all_medications.map((m, i) => (
                    <div key={i} style={{ fontSize: '13px', display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #f1f5f9', paddingBottom: '4px' }}>
                      <strong style={{ color: 'var(--text-dark)' }}>{m.name}</strong>
                      <span style={{ color: 'var(--text-muted)' }}>{m.dosage} ({m.source_date})</span>
                    </div>
                  ))}
                </div>
              ) : (
                <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>No medications found.</span>
              )}
            </div>

            {/* Lab Test Trends */}
            <div style={{ background: '#ffffff', padding: '14px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}>
              <div style={{ fontSize: '13px', fontWeight: 800, color: 'var(--ayush-teal)', marginBottom: '8px' }}>
                🧪 Lab Investigation Trends:
              </div>
              {all_investigations.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {all_investigations.map((inv, i) => (
                    <div key={i} style={{ fontSize: '13px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #f1f5f9', paddingBottom: '4px' }}>
                      <div>
                        <strong>{inv.test_name}</strong>
                        <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginLeft: '6px' }}>({inv.source_date})</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span>{inv.value}</span>
                        {inv.flagged_abnormal && (
                          <span style={{ background: 'var(--danger-light)', color: 'var(--danger)', padding: '2px 6px', borderRadius: '8px', fontSize: '10px', fontWeight: 800 }}>
                            ABNORMAL
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>No lab test results found.</span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Chronological Documents List */}
      <div>
        <h3 style={{ fontSize: '16px', fontWeight: 800, color: 'var(--text-dark)', marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Calendar size={18} color="#0284c7" />
          Chronological Medical Document History ({chronological_records.length} Item{chronological_records.length !== 1 ? 's' : ''})
        </h3>

        {chronological_records.length === 0 && !isProcessing && (
          <div className="card-panel" style={{ textAlign: 'center', padding: '36px', color: 'var(--text-muted)' }}>
            <FileText size={36} style={{ margin: '0 auto 12px', opacity: 0.5 }} />
            <p style={{ fontSize: '15px', fontWeight: 600 }}>No medical documents uploaded yet.</p>
            <p style={{ fontSize: '13px', marginTop: '4px' }}>Upload your prescriptions or lab reports above to digitize and arrange them in chronological order.</p>
          </div>
        )}

        {chronological_records.map((doc, idx) => (
          <div key={doc.document_id || idx} className="card-panel" style={{ marginBottom: '16px', borderLeft: '4px solid var(--primary)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', borderBottom: '1px solid var(--border-color)', paddingBottom: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span className="badge badge-namaste" style={{ textTransform: 'capitalize' }}>
                  {doc.document_type ? doc.document_type.replace('_', ' ') : 'Medical Record'}
                </span>
                <span style={{ fontSize: '14px', fontWeight: 800, color: 'var(--primary-dark)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <Calendar size={14} /> Date: {doc.document_date || 'N/A'}
                </span>
              </div>
              <span style={{ fontSize: '12px', color: 'var(--text-muted)', fontFamily: 'monospace' }}>ID: {doc.document_id}</span>
            </div>

            <div className="grid-2" style={{ gap: '16px' }}>
              {/* Raw Extracted OCR Text */}
              <div>
                <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <Eye size={14} /> Extracted Document Text:
                </div>
                <pre style={{ background: 'var(--bg-slate)', padding: '12px', borderRadius: 'var(--radius-md)', fontSize: '12px', fontFamily: 'monospace', whiteSpace: 'pre-wrap', maxHeight: '180px', overflowY: 'auto', margin: 0, color: 'var(--text-dark)' }}>
                  {doc.raw_ocr_text || '[No text extracted]'}
                </pre>
              </div>

              {/* Structured Extracted Data */}
              <div>
                <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <Sparkles size={14} color="#0d9488" /> Structured Extracted Medical Findings:
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {/* Diagnoses */}
                  {doc.diagnoses && doc.diagnoses.length > 0 && (
                    <div>
                      <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', display: 'block' }}>Diagnoses:</span>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '2px' }}>
                        {doc.diagnoses.map((d, i) => (
                          <span key={i} style={{ background: '#e0f2fe', color: '#0369a1', padding: '2px 8px', borderRadius: '10px', fontSize: '12px', fontWeight: 700 }}>
                            {d}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Medications */}
                  {doc.medications && doc.medications.length > 0 && (
                    <div>
                      <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', display: 'block' }}>Medications:</span>
                      <div style={{ background: 'var(--bg-slate)', padding: '6px 10px', borderRadius: '6px', marginTop: '2px', fontSize: '12px' }}>
                        {doc.medications.map((m, i) => (
                          <div key={i} style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <strong>💊 {m.name}</strong>
                            <span>{m.dosage}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Investigations */}
                  {doc.investigations && doc.investigations.length > 0 && (
                    <div>
                      <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', display: 'block' }}>Lab Test Results:</span>
                      <div style={{ background: 'var(--bg-slate)', padding: '6px 10px', borderRadius: '6px', marginTop: '2px', fontSize: '12px' }}>
                        {doc.investigations.map((inv, i) => (
                          <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span><strong>{inv.test_name}</strong> {inv.reference_range ? `(Ref: ${inv.reference_range})` : ''}</span>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                              <strong>{inv.value}</strong>
                              {inv.flagged_abnormal && (
                                <span style={{ background: 'var(--danger-light)', color: 'var(--danger)', padding: '1px 6px', borderRadius: '6px', fontSize: '10px', fontWeight: 800 }}>
                                  ABNORMAL
                                </span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
