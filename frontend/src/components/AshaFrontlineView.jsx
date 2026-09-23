import React, { useState, useEffect } from 'react';
import { 
  HeartPulse, RefreshCw, Plus, CheckCircle2, 
  Calendar, AlertCircle, User, FileText, Send, Check,
  Wifi, WifiOff, AlertTriangle, ShieldAlert
} from 'lucide-react';

export default function AshaFrontlineView({ currentUser }) {
  // Connectivity state
  const [isOnline, setIsOnline] = useState(typeof window !== 'undefined' ? navigator.onLine : true);
  const [pendingQueue, setPendingQueue] = useState([]);
  const [syncStatus, setSyncStatus] = useState('');
  const [syncing, setSyncing] = useState(false);

  // Section 1: Red Flag Alerts state
  const [redFlagAlerts, setRedFlagAlerts] = useState([
    {
      id: 'alert-402',
      patient_id: '402',
      patient_name: 'Patient #402',
      symptom: 'severe chest pain & shortness of breath',
      location: 'Kiosk Booth #1 / Waiting Area',
      priority: 'EMERGENCY RED FLAG',
      created_at: 'Just Now',
      status: 'ACTIVE'
    }
  ]);

  // Section 2: High Risk Tasks Checklist state
  const [tasks, setTasks] = useState([
    {
      id: 'hr-101',
      patient_id: 'pat-priya-101',
      patient_name: 'Priya',
      condition_tag: '3rd Trimester Pregnancy',
      action_needed: 'Check Vitals & Fetal Movement',
      follow_up_due_date: new Date().toISOString().split('T')[0],
      status: 'PENDING_VISIT',
      bp: '130/85',
      hb: '10.8',
      notes: 'Scheduled 3rd trimester routine home check'
    },
    {
      id: 'hr-102',
      patient_id: 'pat-ramesh-102',
      patient_name: 'Ramesh',
      condition_tag: 'Chronic Diabetes',
      action_needed: 'Blood Sugar Check & Medication Compliance',
      follow_up_due_date: new Date().toISOString().split('T')[0],
      status: 'PENDING_VISIT',
      bp: '138/88',
      hb: '12.0',
      notes: 'Check fasting blood sugar and insulin adherence'
    },
    {
      id: 'hr-103',
      patient_id: 'pat-sita-103',
      patient_name: 'Sita Devi',
      condition_tag: 'Severe Anemia (Hb 7.2)',
      action_needed: 'Hemoglobin & Iron Supplement Monitor',
      follow_up_due_date: new Date().toISOString().split('T')[0],
      status: 'PENDING_VISIT',
      bp: '110/70',
      hb: '7.2',
      notes: 'Severe anemia monitoring & IFA tablet supply'
    },
    {
      id: 'hr-104',
      patient_id: 'pat-devraj-104',
      patient_name: 'Devraj',
      condition_tag: 'Elderly Malnutrition & HTN',
      action_needed: 'Nutritional Intake & BP Check',
      follow_up_due_date: new Date().toISOString().split('T')[0],
      status: 'PENDING_VISIT',
      bp: '145/92',
      hb: '11.2',
      notes: 'Elderly home care visit and dietary compliance'
    }
  ]);

  const [selectedTask, setSelectedTask] = useState(null);
  const [loading, setLoading] = useState(false);

  // Field Visit Form State
  const [patientIdInput, setPatientIdInput] = useState('');
  const [patientName, setPatientName] = useState('');
  const [conditionTag, setConditionTag] = useState('3rd Trimester Pregnancy');
  const [actionNeeded, setActionNeeded] = useState('Check Vitals');
  const [dueDate, setDueDate] = useState(new Date().toISOString().split('T')[0]);
  const [visitNotes, setVisitNotes] = useState('');
  const [vitalsBp, setVitalsBp] = useState('120/80');
  const [vitalsHb, setVitalsHb] = useState('11.5');

  // Network status listeners
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Load offline queue & fetch server tasks
  useEffect(() => {
    const saved = localStorage.getItem('asha_offline_queue');
    if (saved) {
      try {
        setPendingQueue(JSON.parse(saved));
      } catch (e) {}
    }
    fetchHighRiskTasks();
    fetchRedFlagAlerts();
  }, []);

  const fetchHighRiskTasks = async () => {
    try {
      const res = await fetch('/api/v1/followups/high-risk');
      if (res.ok) {
        const data = await res.json();
        const serverList = data.tasks || [];
        if (serverList.length > 0) {
          // Merge server tasks with initial items
          setTasks(serverList);
          handleSelectTask(serverList[0]);
        } else {
          handleSelectTask(tasks[0]);
        }
      }
    } catch (e) {
      console.log('Using local high-risk task list');
      if (tasks.length > 0) handleSelectTask(tasks[0]);
    }
  };

  const fetchRedFlagAlerts = async () => {
    try {
      const res = await fetch('/api/auth/patients');
      if (res.ok) {
        const data = await res.json();
        const redFlags = (data.patients || []).filter(p => p.red_flag_detected);
        if (redFlags.length > 0) {
          const formatted = redFlags.map((p, idx) => ({
            id: `alert-${p.patient_id}`,
            patient_id: p.patient_id,
            patient_name: p.patient_id,
            symptom: p.red_flag_reason || p.chief_complaint || 'severe emergency symptoms',
            location: 'Kiosk Booth #1 / Waiting Area',
            priority: 'EMERGENCY RED FLAG',
            created_at: p.created_at || 'Just Now',
            status: 'ACTIVE'
          }));
          setRedFlagAlerts(formatted);
        }
      }
    } catch (e) {
      console.log('Red flag alert fetch fallback');
    }
  };

  const handleSelectTask = (task) => {
    setSelectedTask(task);
    setPatientIdInput(task.patient_id || task.id);
    setPatientName(task.patient_name || task.name || task.patient_id);
    setConditionTag(task.condition_tag || '3rd Trimester Pregnancy');
    setActionNeeded(task.action_needed || 'Check Vitals');
    setDueDate(task.follow_up_due_date || new Date().toISOString().split('T')[0]);
    setVisitNotes(task.notes || '');
    setVitalsBp(task.bp || '120/80');
    setVitalsHb(task.hb || '11.5');
  };

  const handleToggleTaskCheck = (taskId) => {
    setTasks(prev => prev.map(t => {
      if (t.id === taskId) {
        const newStatus = t.status === 'COMPLETED' ? 'PENDING_VISIT' : 'COMPLETED';
        return { ...t, status: newStatus };
      }
      return t;
    }));

    if (selectedTask && selectedTask.id === taskId) {
      setSelectedTask(prev => prev ? {
        ...prev,
        status: prev.status === 'COMPLETED' ? 'PENDING_VISIT' : 'COMPLETED'
      } : null);
    }
  };

  const handleAddNewVisitMode = () => {
    setSelectedTask(null);
    setPatientIdInput(`pat-asha-${Date.now().toString().slice(-4)}`);
    setPatientName('');
    setConditionTag('3rd Trimester Pregnancy');
    setActionNeeded('Check Vitals & General Health');
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
        action_needed: actionNeeded,
        notes: visitNotes,
        bp: vitalsBp,
        hb: vitalsHb,
        status: 'COMPLETED',
        follow_up_due_date: dueDate
      },
      client_timestamp: new Date().toISOString()
    };

    if (isOnline) {
      try {
        const res = await fetch('/api/v1/sync/batch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ worker_id: currentUser?.user_id || 'ASHA-001', mutations: [mutation] })
        });

        if (res.ok) {
          setSyncStatus(`Visit record for ${patientName} saved & synced to server!`);
          updateTaskAsCompleted(selectedTask?.id, 'COMPLETED');
          setTimeout(() => setSyncStatus(''), 4000);
          return;
        }
      } catch (err) {
        // Fallback to offline queue
      }
    }

    // Save to local offline queue if offline or server unreachable
    saveToOfflineQueue(mutation);
  };

  const updateTaskAsCompleted = (taskId, statusLabel) => {
    if (taskId) {
      setTasks(prev => prev.map(t => t.id === taskId ? { ...t, status: statusLabel } : t));
      setSelectedTask(prev => prev ? { ...prev, status: statusLabel } : null);
    }
  };

  const saveToOfflineQueue = (mutation) => {
    const updated = [...pendingQueue, mutation];
    setPendingQueue(updated);
    localStorage.setItem('asha_offline_queue', JSON.stringify(updated));
    setSyncStatus(`Saved to offline queue (${updated.length} pending items ready to sync).`);
    updateTaskAsCompleted(selectedTask?.id, 'COMPLETED (OFFLINE)');
    setTimeout(() => setSyncStatus(''), 4000);
  };

  const handleTriggerSync = async () => {
    if (pendingQueue.length === 0) {
      setSyncStatus('No pending offline items to sync.');
      setTimeout(() => setSyncStatus(''), 3000);
      return;
    }

    setSyncing(true);
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
        setSyncStatus(`Successfully synced ${data.synced_count || pendingQueue.length} offline records to central database!`);
        setPendingQueue([]);
        localStorage.removeItem('asha_offline_queue');
        fetchHighRiskTasks();
        setTimeout(() => setSyncStatus(''), 4000);
      } else {
        throw new Error('Sync failed');
      }
    } catch (err) {
      setSyncStatus('Sync error: Network unavailable or server offline.');
      setTimeout(() => setSyncStatus(''), 4000);
    } finally {
      setSyncing(false);
    }
  };

  const handleInterveneEmergency = (alert) => {
    setSyncStatus(`🚨 EMERGENCY INTERVENTION INITIATED: Patient #${alert.patient_id} removed from waiting queue. Vitals check in progress.`);
  };

  const handleEscalateDoctor = (alert) => {
    setSyncStatus(`⚡ ESCALATED TO DOCTOR: Patient #${alert.patient_id} red flag alert routed directly to Tele-Booth #1 / OPD Specialist.`);
  };

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '16px' }}>
      
      {/* ================================================================ */}
      {/* TOP HEADER: CONNECTIVITY STATUS & SYNC NOW                       */}
      {/* ================================================================ */}
      <div className="card-panel" style={{ padding: '16px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <h2 style={{ fontSize: '18px', fontWeight: 800, color: 'var(--text-dark)', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
            👩‍⚕️ ASHA Frontline Health Worker Dashboard
          </h2>
          
          {/* Connectivity Status Indicator */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 14px',
              borderRadius: '20px',
              fontSize: '12px',
              fontWeight: 800,
              background: isOnline ? '#dcfce7' : '#ffedd5',
              color: isOnline ? '#166534' : '#c2410c',
              border: isOnline ? '1px solid #bbf7d0' : '1px solid #fed7aa'
            }}>
              {isOnline ? <Wifi size={14} color="#166534" /> : <WifiOff size={14} color="#c2410c" />}
              <span>{isOnline ? 'Online' : 'Offline Mode'}</span>
            </span>

            <button 
              onClick={() => setIsOnline(!isOnline)}
              style={{
                background: 'transparent',
                border: '1px solid #cbd5e1',
                padding: '4px 10px',
                borderRadius: '12px',
                fontSize: '11px',
                cursor: 'pointer',
                color: '#64748b'
              }}
              title="Click to toggle network mode for low-network simulation"
            >
              Toggle Low Network
            </button>
          </div>
        </div>

        {/* Sync Now Button with Badge */}
        <button
          onClick={handleTriggerSync}
          className="touch-btn primary"
          style={{ padding: '8px 18px', fontSize: '13px', borderRadius: '20px', display: 'flex', alignItems: 'center', gap: '8px' }}
        >
          <RefreshCw size={15} className={syncing ? 'spin' : ''} />
          <span>Sync Now</span>
          {pendingQueue.length > 0 && (
            <span style={{
              background: '#ef4444',
              color: '#ffffff',
              borderRadius: '12px',
              padding: '2px 8px',
              fontSize: '11px',
              fontWeight: 800
            }}>
              {pendingQueue.length} waiting
            </span>
          )}
        </button>
      </div>

      {/* Global Notification Banner */}
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

      {/* ================================================================ */}
      {/* SECTION 1: EMERGENCY RED-FLAG ALERTS (TOP OF SCREEN)            */}
      {/* ================================================================ */}
      <div style={{
        background: '#fef2f2',
        border: '2px solid #ef4444',
        borderRadius: '16px',
        padding: '18px 22px',
        boxShadow: '0 4px 12px rgba(239, 68, 68, 0.12)'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap', gap: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{
              background: '#dc2626',
              color: '#ffffff',
              padding: '8px',
              borderRadius: '10px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <AlertCircle size={22} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: '#991b1b', display: 'flex', alignItems: 'center', gap: '8px' }}>
                🚨 Section 1: Emergency Red-Flag Alerts (Real-Time Kiosk Alerts)
              </h3>
              <p style={{ margin: '2px 0 0 0', fontSize: '12px', color: '#7f1d1d' }}>
                Acute, life-threatening symptoms detected at kiosk. ASHA must drop routine tasks and intervene immediately.
              </p>
            </div>
          </div>

          <span style={{
            background: '#dc2626',
            color: '#ffffff',
            fontWeight: 800,
            fontSize: '11px',
            padding: '4px 12px',
            borderRadius: '20px',
            letterSpacing: '0.5px'
          }}>
            IMMEDIATE EMERGENCY ALARM
          </span>
        </div>

        {/* Red Flag Alert Cards */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {redFlagAlerts.map((alert, idx) => (
            <div key={idx} style={{
              background: '#ffffff',
              border: '1px solid #fca5a5',
              borderRadius: '12px',
              padding: '14px 18px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '12px'
            }}>
              <div>
                <div style={{ fontSize: '14px', fontWeight: 800, color: '#991b1b' }}>
                  🚨 URGENT: Patient #{alert.patient_id} in waiting area reported {alert.symptom}. Intervene immediately.
                </div>
                <div style={{ fontSize: '12px', color: '#4b5563', marginTop: '4px' }}>
                  Location: <strong>{alert.location}</strong> | Status: <span style={{ color: '#dc2626', fontWeight: 700 }}>{alert.priority}</span> ({alert.created_at})
                </div>
              </div>

              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  onClick={() => handleInterveneEmergency(alert)}
                  className="touch-btn"
                  style={{ background: '#dc2626', color: '#ffffff', border: 'none', padding: '8px 14px', fontSize: '12px', fontWeight: 700, borderRadius: '8px' }}
                >
                  Intervene & Check Vitals
                </button>
                <button
                  onClick={() => handleEscalateDoctor(alert)}
                  className="touch-btn"
                  style={{ background: '#991b1b', color: '#ffffff', border: 'none', padding: '8px 14px', fontSize: '12px', fontWeight: 700, borderRadius: '8px' }}
                >
                  Escalate to Doctor
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ================================================================ */}
      {/* SECTION 2: DAILY HIGH-RISK FOLLOW-UPS (CORE WORKFLOW)            */}
      {/* ================================================================ */}
      <div className="grid-2" style={{ alignItems: 'start' }}>
        
        {/* Left Sub-Panel: Daily Checklist of Home Visits */}
        <div className="card-panel">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '8px' }}>
            <div>
              <h3 style={{ fontSize: '16px', fontWeight: 800, color: 'var(--text-dark)', margin: 0 }}>
                📋 Section 2: Daily High-Risk Follow-Ups
              </h3>
              <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '2px 0 0 0' }}>
                Core home-visit checklist for ongoing vulnerable patient care.
              </p>
            </div>

            <button
              onClick={handleAddNewVisitMode}
              className="touch-btn ayush"
              style={{ padding: '6px 12px', fontSize: '12px' }}
            >
              <Plus size={14} /> New Visit
            </button>
          </div>

          {/* Home Care Checklist Items */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {tasks.map((task, idx) => {
              const isSelected = selectedTask?.id === task.id || (selectedTask?.patient_id && selectedTask.patient_id === task.patient_id);
              const isCompleted = task.status === 'COMPLETED' || task.status === 'COMPLETED (OFFLINE)';

              return (
                <div 
                  key={idx}
                  style={{
                    padding: '14px 16px',
                    borderRadius: '12px',
                    border: isSelected ? '2px solid var(--primary)' : '1px solid var(--border-color)',
                    background: isSelected ? '#f0f9ff' : '#ffffff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '12px',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease'
                  }}
                  onClick={() => handleSelectTask(task)}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1 }}>
                    {/* Checkbox Checklist [ ] / [x] */}
                    <input
                      type="checkbox"
                      checked={isCompleted}
                      onChange={(e) => {
                        e.stopPropagation();
                        handleToggleTaskCheck(task.id);
                      }}
                      style={{ width: '18px', height: '18px', cursor: 'pointer', accentColor: 'var(--primary)' }}
                    />

                    <div>
                      <div style={{ fontSize: '14px', fontWeight: 800, color: isCompleted ? '#64748b' : 'var(--text-dark)', textDecoration: isCompleted ? 'line-through' : 'none' }}>
                        Visit {task.patient_name || task.patient_id} ({task.condition_tag || 'High Risk'}) - <span style={{ color: 'var(--primary-dark)' }}>{task.action_needed || 'Check Vitals'}</span>.
                      </div>
                      <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
                        Due: <strong>{task.follow_up_due_date || 'Today'}</strong> | ID: {task.patient_id || task.id}
                      </div>
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
                    gap: '4px',
                    whiteSpace: 'nowrap'
                  }}>
                    {isCompleted && <Check size={12} />}
                    {task.status || 'PENDING_VISIT'}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right Sub-Panel: Correlated Visit Record Form */}
        <div className="card-panel">
          <div style={{ marginBottom: '16px', borderBottom: '1px solid var(--border-color)', paddingBottom: '12px' }}>
            <h3 style={{ fontSize: '16px', fontWeight: 800, color: 'var(--text-dark)', margin: '0 0 4px 0' }}>
              📝 Record Field Visit / Follow-up Notes
            </h3>
            <p style={{ fontSize: '12px', color: 'var(--primary-dark)', fontWeight: 700, margin: 0 }}>
              {selectedTask 
                ? `Active Checklist Item: Visit ${selectedTask.patient_name || selectedTask.patient_id}` 
                : 'Recording visit for new patient (Click a patient checklist item to auto-fill)'}
            </p>
          </div>

          <form onSubmit={handleSaveVisitForm} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div>
              <label style={{ fontSize: '12px', fontWeight: 700, color: '#334155' }}>Patient Name:</label>
              <input
                type="text"
                placeholder="e.g. Priya"
                value={patientName}
                onChange={(e) => setPatientName(e.target.value)}
                style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', marginTop: '4px', fontSize: '13px' }}
                required
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div>
                <label style={{ fontSize: '12px', fontWeight: 700, color: '#334155' }}>Condition Tag:</label>
                <input
                  type="text"
                  placeholder="e.g. 3rd Trimester Pregnancy"
                  value={conditionTag}
                  onChange={(e) => setConditionTag(e.target.value)}
                  style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', marginTop: '4px', fontSize: '13px' }}
                />
              </div>

              <div>
                <label style={{ fontSize: '12px', fontWeight: 700, color: '#334155' }}>Required Action:</label>
                <input
                  type="text"
                  placeholder="e.g. Check Vitals"
                  value={actionNeeded}
                  onChange={(e) => setActionNeeded(e.target.value)}
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
                <label style={{ fontSize: '12px', fontWeight: 700, color: '#334155' }}>Hemoglobin / Blood Sugar:</label>
                <input
                  type="text"
                  placeholder="11.5 g/dL"
                  value={vitalsHb}
                  onChange={(e) => setVitalsHb(e.target.value)}
                  style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', marginTop: '4px', fontSize: '13px' }}
                />
              </div>
            </div>

            <div>
              <label style={{ fontSize: '12px', fontWeight: 700, color: '#334155' }}>Field Observations & Clinical Notes:</label>
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
