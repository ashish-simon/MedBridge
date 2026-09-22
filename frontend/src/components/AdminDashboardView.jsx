import React, { useState, useEffect } from 'react';
import { ShieldCheck, Activity, PhoneCall, AlertTriangle, CheckCircle2, TrendingUp, Users, RefreshCw } from 'lucide-react';

export default function AdminDashboardView() {
  const [stats, setStats] = useState({
    totalEncounters: 0,
    kioskIntakes: 0,
    teleconsults: 0,
    redFlagsCount: 0,
    highRiskTracked: 0,
    referrals: {
      pending: 0,
      in_transit: 0,
      arrived: 0,
      completed: 0,
      total: 0
    }
  });

  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchAdminMetrics();
  }, []);

  const fetchAdminMetrics = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/v1/admin/analytics');
      if (res.ok) {
        const data = await res.json();
        setStats({
          totalEncounters: data.total_encounters || 0,
          kioskIntakes: data.kiosk_intakes || 0,
          teleconsults: data.teleconsults || 0,
          redFlagsCount: data.red_flags_count || 0,
          highRiskTracked: data.high_risk_tracked || 0,
          referrals: data.referrals || { pending: 0, in_transit: 0, arrived: 0, completed: 0, total: 0 }
        });
      }
    } catch (e) {
      console.error('Fetch admin analytics error:', e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Header Banner */}
      <div className="card-panel" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '20px 24px' }}>
        <div>
          <h2 style={{ fontSize: '20px', fontWeight: 800, color: 'var(--text-dark)', margin: 0 }}>
            📊 Rural Healthcare Continuum Administrator Dashboard
          </h2>
          <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: '4px 0 0 0' }}>
            System-wide Facility Analytics, Referral Completion Metrics & High-Risk Tracking
          </p>
        </div>

        <button
          onClick={fetchAdminMetrics}
          className="touch-btn primary"
          style={{ padding: '8px 16px', fontSize: '13px' }}
        >
          <RefreshCw size={14} /> Refresh Analytics
        </button>
      </div>

      {/* Analytics Summary Cards */}
      <div className="grid-3">
        <div className="card-panel" style={{ background: 'linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%)', border: '1px solid #bae6fd' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: '12px', fontWeight: 800, color: '#0369a1', textTransform: 'uppercase' }}>Total Patient Encounters</div>
              <div style={{ fontSize: '32px', fontWeight: 800, color: '#0f172a', margin: '4px 0' }}>{stats.totalEncounters}</div>
            </div>
            <Users size={36} color="#0284c7" />
          </div>
          <div style={{ fontSize: '12px', color: '#0369a1', marginTop: '4px' }}>
            Kiosk Intakes: {stats.kioskIntakes} | Teleconsults: {stats.teleconsults}
          </div>
        </div>

        <div className="card-panel" style={{ background: 'linear-gradient(135deg, #fef2f2 0%, #fee2e2 100%)', border: '1px solid #fecaca' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: '12px', fontWeight: 800, color: '#991b1b', textTransform: 'uppercase' }}>Red-Flag Emergency Triage</div>
              <div style={{ fontSize: '32px', fontWeight: 800, color: '#0f172a', margin: '4px 0' }}>{stats.redFlagsCount}</div>
            </div>
            <AlertTriangle size={36} color="#dc2626" />
          </div>
          <div style={{ fontSize: '12px', color: '#991b1b', marginTop: '4px' }}>
            Flagged for instant priority triage
          </div>
        </div>

        <div className="card-panel" style={{ background: 'linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%)', border: '1px solid #bbf7d0' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: '12px', fontWeight: 800, color: '#166534', textTransform: 'uppercase' }}>High-Risk Patients Tracked</div>
              <div style={{ fontSize: '32px', fontWeight: 800, color: '#0f172a', margin: '4px 0' }}>{stats.highRiskTracked}</div>
            </div>
            <Activity size={36} color="#16a34a" />
          </div>
          <div style={{ fontSize: '12px', color: '#166534', marginTop: '4px' }}>
            Assigned to local ASHA frontline workers
          </div>
        </div>
      </div>

      {/* System-Wide Referral Completion Progress Bar */}
      <div className="card-panel">
        <h3 style={{ fontSize: '16px', fontWeight: 800, color: 'var(--text-dark)', marginBottom: '16px' }}>
          🔄 Inter-Facility Referral Pipeline Metrics
        </h3>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '20px' }}>
          <div style={{ padding: '12px', borderRadius: '10px', background: '#fef3c7', border: '1px solid #fde68a' }}>
            <div style={{ fontSize: '11px', fontWeight: 800, color: '#b45309' }}>1. PENDING</div>
            <div style={{ fontSize: '22px', fontWeight: 800, color: '#92400e' }}>{stats.referrals.pending}</div>
          </div>
          <div style={{ padding: '12px', borderRadius: '10px', background: '#e0f2fe', border: '1px solid #bae6fd' }}>
            <div style={{ fontSize: '11px', fontWeight: 800, color: '#0369a1' }}>2. IN TRANSIT</div>
            <div style={{ fontSize: '22px', fontWeight: 800, color: '#075985' }}>{stats.referrals.in_transit}</div>
          </div>
          <div style={{ padding: '12px', borderRadius: '10px', background: '#f3e8ff', border: '1px solid #e9d5ff' }}>
            <div style={{ fontSize: '11px', fontWeight: 800, color: '#6b21a8' }}>3. ARRIVED</div>
            <div style={{ fontSize: '22px', fontWeight: 800, color: '#581c87' }}>{stats.referrals.arrived}</div>
          </div>
          <div style={{ padding: '12px', borderRadius: '10px', background: '#dcfce7', border: '1px solid #bbf7d0' }}>
            <div style={{ fontSize: '11px', fontWeight: 800, color: '#166534' }}>4. COMPLETED</div>
            <div style={{ fontSize: '22px', fontWeight: 800, color: '#14532d' }}>{stats.referrals.completed}</div>
          </div>
        </div>

        {/* Visual Referral Pipeline Bar */}
        <div style={{ height: '12px', borderRadius: '6px', background: '#e2e8f0', display: 'flex', overflow: 'hidden' }}>
          <div style={{ width: `${stats.referrals.total ? (stats.referrals.pending / stats.referrals.total) * 100 : 0}%`, background: '#f59e0b' }} title="Pending" />
          <div style={{ width: `${stats.referrals.total ? (stats.referrals.in_transit / stats.referrals.total) * 100 : 0}%`, background: '#0284c7' }} title="In Transit" />
          <div style={{ width: `${stats.referrals.total ? (stats.referrals.arrived / stats.referrals.total) * 100 : 0}%`, background: '#8b5cf6' }} title="Arrived" />
          <div style={{ width: `${stats.referrals.total ? (stats.referrals.completed / stats.referrals.total) * 100 : 0}%`, background: '#16a34a' }} title="Completed" />
        </div>
      </div>
    </div>
  );
}
