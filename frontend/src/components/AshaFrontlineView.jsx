import React, { useState, useEffect } from 'react';
import { 
  HeartPulse, Wifi, WifiOff, RefreshCw, Plus, CheckCircle2, 
  Calendar, AlertCircle, User, FileText, Send, MapPin, Search 
} from 'lucide-react';

export default function AshaFrontlineView({ currentUser }) {
  const [isOnline, setIsOnline] = useState(true);
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pendingQueue, setPendingQueue] = useState([]);
  const [syncStatus, setSyncStatus] = useState('');
  
  // New Visit Form State
  const [showAddModal, setShowAddModal] = useState(false);
  const [patientIdInput, setPatientIdInput] = useState('');
  const [patientName, setPatientName] = useState('');
  const [conditionTag, setConditionTag] = useState('High-Risk Pregnancy');
  const [dueDate, setDueDate] = useState(new Date().toISOString().split('T')[0]);
  const [visitNotes, setVisitNotes] = useState('');
  const [vitalsBp, setVitalsBp] = useState('120/80');
  const [vitalsHb, setVitalsHb] = useState('11.5');

  // Load offline queue from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('asha_offline_queue');
    if (saved) {
      try {
        setPendingQueue(JSON.parse(saved));
      } catch (e) {}
    }
    fetchHighRiskTasks();
  }, []);

  const fetchHighRiskTasks = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/v1/followups/high-risk');
      if (res.ok) {
        const data = await res.json();
        setTasks(data.tasks || []);
      }
    } catch (e) {
      console.log('Using local fallback tasks');
    } finally {
      setLoading(false);
    }
  };

  const handleToggleOnline = () => {
    setIsOnline(prev => !prev);
  };

  const handleSaveVisitForm = async (e) => {
    e.preventDefault();
    if (!patientName.trim()) return;

    const pid = patientIdInput.trim() || `pat-asha-${Date.now()}`;
    const mutation = {
      mutation_id: `mut-${Date.now()}`,
      type: 'visit_note',
      patient_id: pid,
      payload: {
        name: patientName,
        condition_tag: conditionTag,
        notes: visitNotes,
        bp: vitalsBp,
        hb: vitalsHb,
        follow_up_due_date: dueDate
      },
      client_timestamp: new Date().toISOString()
    };

    if (isOnline) {
      // Direct online submission
      try {
        await fetch('/api/v1/sync/batch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ worker_id: currentUser?.user_id || 'ASHA-001', mutations: [mutation] })
        });
        setSyncStatus('Visit note saved & synced directly to server!');
        fetchHighRiskTasks();
      } catch (err) {
        // Fallback to offline queue
        saveToOfflineQueue(mutation);
      }
    } else {
      // Save offline
      saveToOfflineQueue(mutation);
    }

    setShowAddModal(false);
    resetForm();
  };

  const saveToOfflineQueue = (mutation) => {
    const updated = [...pendingQueue, mutation];
    setPendingQueue(updated);
    localStorage.setItem('asha_offline_queue', JSON.stringify(updated));
    setSyncStatus(`Offline mode active. Saved to local queue (${updated.length} pending).`);
  };

  const handleTriggerSync = async () => {
    if (pendingQueue.length === 0) {
      setSyncStatus('No pending offline items to sync.');
      return;
    }

    setSyncStatus('Synchronizing batch payload with FastAPI server...');
    try {
      const res = await fetch('/api/v1/sync/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          worker_id: currentUser?.user_id || 'ASHA-001',
          mutations: pendingQueue
        })
      });

      const data = await res.json();
      if (res.ok) {
        setSyncStatus(`Successfully synced ${data.synced_count} records! Conflict resolution resolved.`);
        setPendingQueue([]);
        localStorage.removeItem('asha_offline_queue');
        fetchHighRiskTasks();
      } else {
        throw new Error('Sync failed');
      }
    } catch (err) {
      setSyncStatus('Sync error. Will retry when connection stabilizes.');
    }
  };

  const resetForm = () => {
    setPatientIdInput('');
    setPatientName('');
    setVisitNotes('');
  };

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Top Banner: Online / Offline Status Badge */}
      <div className="card-panel" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '20px 24px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <h2 style={{ fontSize: '20px', fontWeight: 800, color: 'var(--text-dark)', margin: 0 }}>
              🏡 ASHA Frontline Worker Continuum App
            </h2>
            <div style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '4px 12px',
              borderRadius: '20px',
              fontSize: '12px',
              fontWeight: 800,
              background: isOnline ? '#dcfce7' : '#fee2e2',
              color: isOnline ? '#166534' : '#991b1b'
            }}>
              {isOnline ? <Wifi size={14} /> : <WifiOff size={14} />}
              <span>{isOnline ? 'ONLINE' : 'OFFLINE MODE'}</span>
            </div>
          </div>
          <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: '4px 0 0 0' }}>
            Assigned Community Region: Rural Block 04 | Frontline Health Worker ID: {currentUser?.user_id || 'ASHA-001'}
          </p>
        </div>

        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          {/* Offline simulator toggle */}
          <button
            onClick={handleToggleOnline}
            style={{
              padding: '8px 14px',
              borderRadius: '20px',
              border: '1px solid var(--border-color)',
              background: '#ffffff',
              fontSize: '12px',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            {isOnline ? <WifiOff size={14} /> : <Wifi size={14} />}
            Simulate {isOnline ? 'Offline' : 'Online'}
          </button>

          {/* Sync Batch Button */}
          <button
            onClick={handleTriggerSync}
            className="touch-btn primary"
            style={{ padding: '10px 18px', fontSize: '14px', borderRadius: '20px' }}
          >
            <RefreshCw size={16} />
            <span>Sync Queue ({pendingQueue.length})</span>
          </button>
        </div>
      </div>

      {syncStatus && (
        <div style={{
          background: '#f0fdf4',
          color: '#166534',
          border: '1px solid #bbf7d0',
          padding: '12px 16px',
          borderRadius: '10px',
          fontSize: '13px',
          fontWeight: 600,
          display: 'flex',
          alignItems: 'center',
          gap: '8px'
        }}>
          <CheckCircle2 size={16} />
          <div>{syncStatus}</div>
        </div>
      )}

      {/* Main Grid: High-Risk Schedule & New Visit Form */}
      <div className="grid-2" style={{ alignItems: 'start' }}>
        {/* Left: High Risk Task Schedule */}
        <div className="card-panel">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h3 style={{ fontSize: '16px', fontWeight: 800, color: 'var(--text-dark)', margin: 0 }}>
              📋 High-Risk Patient Task List (Home-Visit Schedule)
            </h3>
            <button
              onClick={() => setShowAddModal(true)}
              className="touch-btn ayush"
              style={{ padding: '8px 14px', fontSize: '13px' }}
            >
              <Plus size={16} /> Add Visit
            </button>
          </div>

          {loading ? (
            <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)' }}>Loading schedule...</div>
          ) : tasks.length === 0 ? (
            <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)' }}>No pending high-risk visits.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {tasks.map((task, idx) => (
                <div 
                  key={idx}
                  style={{
                    padding: '14px',
                    borderRadius: '10px',
                    border: '1px solid var(--border-color)',
                    background: '#ffffff',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                  }}
                >
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                      <span style={{ fontWeight: 800, fontSize: '15px' }}>{task.patient_name || task.patient_id}</span>
                      <span className="badge badge-snomed">{task.condition_tag || 'High Risk'}</span>
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                      Due Date: <strong>{task.follow_up_due_date || 'Today'}</strong> | Assigned: {task.assigned_worker_id || 'ASHA-001'}
                    </div>
                  </div>

                  <span style={{
                    fontSize: '11px',
                    fontWeight: 800,
                    padding: '4px 8px',
                    borderRadius: '6px',
                    background: task.status === 'COMPLETED' ? '#dcfce7' : '#fef3c7',
                    color: task.status === 'COMPLETED' ? '#166534' : '#b45309'
                  }}>
                    {task.status || 'PENDING'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right: Offline Intake & Visit Form */}
        <div className="card-panel">
          <h3 style={{ fontSize: '16px', fontWeight: 800, color: 'var(--text-dark)', marginBottom: '16px' }}>
            📝 Record Field Visit / Offline Intake
          </h3>

          <form onSubmit={handleSaveVisitForm} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div>
              <label style={{ fontSize: '12px', fontWeight: 700, color: '#334155' }}>Patient Name:</label>
              <input
                type="text"
                placeholder="e.g. Laxmi Devi"
                value={patientName}
                onChange={(e) => setPatientName(e.target.value)}
                style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #cbd5e1', marginTop: '4px' }}
                required
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div>
                <label style={{ fontSize: '12px', fontWeight: 700, color: '#334155' }}>Condition Tag:</label>
                <select
                  value={conditionTag}
                  onChange={(e) => setConditionTag(e.target.value)}
                  style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #cbd5e1', marginTop: '4px' }}
                >
                  <option value="High-Risk Pregnancy">High-Risk Pregnancy</option>
                  <option value="Chronic HTN / Diabetes">Chronic HTN / Diabetes</option>
                  <option value="Severe Anemia">Severe Anemia</option>
                  <option value="Elderly Malnutrition">Elderly Malnutrition</option>
                </select>
              </div>

              <div>
                <label style={{ fontSize: '12px', fontWeight: 700, color: '#334155' }}>Follow-up Due Date:</label>
                <input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #cbd5e1', marginTop: '4px' }}
                />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div>
                <label style={{ fontSize: '12px', fontWeight: 700, color: '#334155' }}>Vitals Blood Pressure:</label>
                <input
                  type="text"
                  placeholder="120/80 mmHg"
                  value={vitalsBp}
                  onChange={(e) => setVitalsBp(e.target.value)}
                  style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #cbd5e1', marginTop: '4px' }}
                />
              </div>

              <div>
                <label style={{ fontSize: '12px', fontWeight: 700, color: '#334155' }}>Hemoglobin (Hb g/dL):</label>
                <input
                  type="text"
                  placeholder="11.5"
                  value={vitalsHb}
                  onChange={(e) => setVitalsHb(e.target.value)}
                  style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #cbd5e1', marginTop: '4px' }}
                />
              </div>
            </div>

            <div>
              <label style={{ fontSize: '12px', fontWeight: 700, color: '#334155' }}>Field Clinical Observations & Notes:</label>
              <textarea
                rows={3}
                placeholder="Record symptoms, medication compliance, fetal movement or vitals updates..."
                value={visitNotes}
                onChange={(e) => setVisitNotes(e.target.value)}
                style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #cbd5e1', marginTop: '4px' }}
              />
            </div>

            <button
              type="submit"
              className="touch-btn primary"
              style={{ marginTop: '8px' }}
            >
              <Send size={16} /> Save Visit Record ({isOnline ? 'Online Sync' : 'Offline Storage'})
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
