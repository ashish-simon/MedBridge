import React, { useState, useEffect } from 'react';
import { 
  HeartPulse, RefreshCw, Plus, CheckCircle2, 
  Calendar, AlertCircle, User, FileText, Send, Check
} from 'lucide-react';

export default function AshaFrontlineView({ currentUser }) {
  const [tasks, setTasks] = useState([]);
  const [selectedTask, setSelectedTask] = useState(null);
  const [loading, setLoading] = useState(true);
  const [pendingQueue, setPendingQueue] = useState([]);
  const [syncStatus, setSyncStatus] = useState('');
  
  // Field Visit Form State
  const [patientIdInput, setPatientIdInput] = useState('');
  const [patientName, setPatientName] = useState('');
  const [conditionTag, setConditionTag] = useState('High-Risk Pregnancy');
  const [dueDate, setDueDate] = useState(new Date().toISOString().split('T')[0]);
  const [visitNotes, setVisitNotes] = useState('');
  const [vitalsBp, setVitalsBp] = useState('120/80');
  const [vitalsHb, setVitalsHb] = useState('11.5');

  // Load offline queue from localStorage & fetch real tasks from DB
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
        const list = data.tasks || [];
        setTasks(list);
        if (list.length > 0) {
          handleSelectTask(list[0]);
        }
      }
    } catch (e) {
      console.error('Fetch high risk tasks error:', e);
    } finally {
      setLoading(false);
    }
  };

  // Direct selection correlation when ASHA clicks a patient card from the list
  const handleSelectTask = (task) => {
    setSelectedTask(task);
    setPatientIdInput(task.patient_id || task.id);
    setPatientName(task.patient_name || task.name || task.patient_id);
    setConditionTag(task.condition_tag || 'High-Risk Pregnancy');
    setDueDate(task.follow_up_due_date || new Date().toISOString().split('T')[0]);
    setVisitNotes(task.notes || '');
    setVitalsBp(task.bp || '120/80');
    setVitalsHb(task.hb || '11.5');
  };

  const handleAddNewVisitMode = () => {
    setSelectedTask(null);
    setPatientIdInput(`pat-asha-${Date.now().toString().slice(-4)}`);
    setPatientName('');
    setConditionTag('High-Risk Pregnancy');
    setDueDate(new Date().toISOString().split('T')[0]);
    setVisitNotes('');
    setVitalsBp('120/80');
    setVitalsHb('11.5');
  };

  const handleSaveVisitForm = async (e) => {
    e.preventDefault();
    if (!patientName.trim()) return;

    const pid = patientIdInput.trim() || selectedTask?.patient_id || `pat-asha-${Date.now()}`;
    const mutation = {
      mutation_id: `mut-${Date.now()}`,
      type: 'high_risk_update',
      patient_id: pid,
      payload: {
        registry_id: selectedTask?.id,
        patient_id: pid,
        name: patientName.trim(),
        condition_tag: conditionTag,
        notes: visitNotes,
        bp: vitalsBp,
        hb: vitalsHb,
        status: 'COMPLETED',
        follow_up_due_date: dueDate
      },
      client_timestamp: new Date().toISOString()
    };

    try {
      const res = await fetch('/api/v1/sync/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ worker_id: currentUser?.user_id || 'ASHA-001', mutations: [mutation] })
      });

      if (res.ok) {
        setSyncStatus(`Follow-up visit for ${patientName} saved & status updated to COMPLETED!`);
        // Immediately update status in task list
        if (selectedTask) {
          setTasks(prev => prev.map(t => t.id === selectedTask.id ? { ...t, status: 'COMPLETED' } : t));
          setSelectedTask(prev => prev ? { ...prev, status: 'COMPLETED' } : null);
        }
        setTimeout(() => setSyncStatus(''), 4000);
      } else {
        saveToOfflineQueue(mutation);
      }
    } catch (err) {
      saveToOfflineQueue(mutation);
    }
  };

  const saveToOfflineQueue = (mutation) => {
    const updated = [...pendingQueue, mutation];
    setPendingQueue(updated);
    localStorage.setItem('asha_offline_queue', JSON.stringify(updated));
    setSyncStatus(`Saved to offline queue (${updated.length} pending items ready to sync).`);
    if (selectedTask) {
      setTasks(prev => prev.map(t => t.id === selectedTask.id ? { ...t, status: 'COMPLETED (OFFLINE)' } : t));
    }
    setTimeout(() => setSyncStatus(''), 4000);
  };

  const handleTriggerSync = async () => {
    if (pendingQueue.length === 0) {
      setSyncStatus('No pending offline items to sync.');
      setTimeout(() => setSyncStatus(''), 3000);
      return;
    }

    setSyncStatus('Synchronizing offline queue with server...');
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
        setSyncStatus(`Successfully synced ${data.synced_count} offline records to central database!`);
        setPendingQueue([]);
        localStorage.removeItem('asha_offline_queue');
        fetchHighRiskTasks();
        setTimeout(() => setSyncStatus(''), 4000);
      } else {
        throw new Error('Sync failed');
      }
    } catch (err) {
      setSyncStatus('Sync error. Network unavailable.');
    }
  };

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Feedback Banner */}
      {syncStatus && (
        <div style={{
          background: '#f0fdf4',
          color: '#166534',
          border: '1px solid #bbf7d0',
          padding: '12px 16px',
          borderRadius: '10px',
          fontSize: '13px',
          fontWeight: 700,
          display: 'flex',
          alignItems: 'center',
          gap: '8px'
        }}>
          <CheckCircle2 size={16} />
          <div>{syncStatus}</div>
        </div>
      )}

      {/* Main Grid: High-Risk Schedule & Correlated Visit Form */}
      <div className="grid-2" style={{ alignItems: 'start' }}>
        {/* Left Panel: High Risk Task List */}
        <div className="card-panel">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '8px' }}>
            <h3 style={{ fontSize: '16px', fontWeight: 800, color: 'var(--text-dark)', margin: 0 }}>
              📋 High-Risk Patient Task List (Home-Visit Schedule)
            </h3>

            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <button
                onClick={handleAddNewVisitMode}
                className="touch-btn ayush"
                style={{ padding: '6px 12px', fontSize: '12px' }}
              >
                <Plus size={14} /> New Patient Visit
              </button>

              {/* Sync Queue Option Button */}
              <button
                onClick={handleTriggerSync}
                className="touch-btn primary"
                style={{ padding: '6px 14px', fontSize: '12px', borderRadius: '20px' }}
              >
                <RefreshCw size={14} />
                <span>Sync Queue ({pendingQueue.length})</span>
              </button>
            </div>
          </div>

          {loading ? (
            <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)' }}>Loading real high-risk schedule...</div>
          ) : tasks.length === 0 ? (
            <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)' }}>No pending high-risk visits found in database.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {tasks.map((task, idx) => {
                const isSelected = selectedTask?.id === task.id || (selectedTask?.patient_id && selectedTask.patient_id === task.patient_id);
                const isCompleted = task.status === 'COMPLETED' || task.status === 'COMPLETED (OFFLINE)';

                return (
                  <div 
                    key={idx}
                    onClick={() => handleSelectTask(task)}
                    style={{
                      padding: '14px 16px',
                      borderRadius: '12px',
                      border: isSelected ? '2px solid var(--primary)' : '1px solid var(--border-color)',
                      background: isSelected ? '#f0f9ff' : '#ffffff',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                        <strong style={{ fontSize: '15px', color: isSelected ? 'var(--primary-dark)' : 'var(--text-dark)' }}>
                          {task.patient_name || task.patient_id}
                        </strong>
                        <span className="badge badge-snomed" style={{ fontSize: '11px' }}>
                          {task.condition_tag || 'High Risk'}
                        </span>
                      </div>
                      <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                        Due Date: <strong>{task.follow_up_due_date || 'Today'}</strong> | ID: {task.patient_id || task.id}
                      </div>
                    </div>

                    <span style={{
                      fontSize: '11px',
                      fontWeight: 800,
                      padding: '4px 10px',
                      borderRadius: '12px',
                      background: isCompleted ? '#dcfce7' : '#fef3c7',
                      color: isCompleted ? '#166534' : '#b45309',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px'
                    }}>
                      {isCompleted && <Check size={12} />}
                      {task.status || 'PENDING_VISIT'}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Right Panel: Directly Correlated Patient Follow-up Form */}
        <div className="card-panel">
          <div style={{ marginBottom: '16px', borderBottom: '1px solid var(--border-color)', paddingBottom: '12px' }}>
            <h3 style={{ fontSize: '16px', fontWeight: 800, color: 'var(--text-dark)', margin: '0 0 4px 0' }}>
              📝 Record Field Visit / Follow-up Notes
            </h3>
            <p style={{ fontSize: '12px', color: 'var(--primary-dark)', fontWeight: 700, margin: 0 }}>
              {selectedTask 
                ? `Active Patient Selected: ${selectedTask.patient_name || selectedTask.patient_id} (${selectedTask.patient_id})` 
                : 'Recording visit for new patient (Click a patient on left to auto-fill)'}
            </p>
          </div>

          <form onSubmit={handleSaveVisitForm} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div>
              <label style={{ fontSize: '12px', fontWeight: 700, color: '#334155' }}>Patient Name:</label>
              <input
                type="text"
                placeholder="e.g. Sita Devi"
                value={patientName}
                onChange={(e) => setPatientName(e.target.value)}
                style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', marginTop: '4px', fontSize: '13px' }}
                required
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div>
                <label style={{ fontSize: '12px', fontWeight: 700, color: '#334155' }}>Condition Tag:</label>
                <select
                  value={conditionTag}
                  onChange={(e) => setConditionTag(e.target.value)}
                  style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', marginTop: '4px', fontSize: '13px' }}
                >
                  <option value="High-Risk Pregnancy & HTN">High-Risk Pregnancy & HTN</option>
                  <option value="Severe Anemia (Hb 7.2)">Severe Anemia (Hb 7.2)</option>
                  <option value="Chronic HTN & Diabetes">Chronic HTN & Diabetes</option>
                  <option value="Elderly Malnutrition">Elderly Malnutrition</option>
                </select>
              </div>

              <div>
                <label style={{ fontSize: '12px', fontWeight: 700, color: '#334155' }}>Follow-up Due Date:</label>
                <input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', marginTop: '4px', fontSize: '13px' }}
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
                  style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', marginTop: '4px', fontSize: '13px' }}
                />
              </div>

              <div>
                <label style={{ fontSize: '12px', fontWeight: 700, color: '#334155' }}>Hemoglobin (Hb g/dL):</label>
                <input
                  type="text"
                  placeholder="11.5"
                  value={vitalsHb}
                  onChange={(e) => setVitalsHb(e.target.value)}
                  style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', marginTop: '4px', fontSize: '13px' }}
                />
              </div>
            </div>

            <div>
              <label style={{ fontSize: '12px', fontWeight: 700, color: '#334155' }}>Field Clinical Observations & Notes:</label>
              <textarea
                rows={4}
                placeholder="Record symptoms, medication compliance, fetal movement or vitals updates..."
                value={visitNotes}
                onChange={(e) => setVisitNotes(e.target.value)}
                style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', marginTop: '4px', fontSize: '13px' }}
              />
            </div>

            <button
              type="submit"
              className="touch-btn primary"
              style={{ marginTop: '8px', padding: '12px', fontSize: '14px', fontWeight: 700 }}
            >
              <Send size={16} /> Save Visit Record & Complete Follow-up
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
