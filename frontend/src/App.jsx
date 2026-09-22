import React, { useState, useEffect } from 'react';
import Header from './components/Header';
import AuthPage from './components/AuthPage';
import ModuleDConsent from './components/ModuleDConsent';
import ModuleAIntake from './components/ModuleAIntake';
import ModuleBDocuments from './components/ModuleBDocuments';
import ModuleCPhysicianView from './components/ModuleCPhysicianView';
import KioskComplete from './components/KioskComplete';
import { CheckCircle2 } from 'lucide-react';

export default function App() {
  const [currentUser, setCurrentUser] = useState(null); // { user_id, username, role, full_name, patient_id }
  const [currentStep, setCurrentStep] = useState(1); // 1: Consent, 2: Intake, 3: Documents, 4: Complete
  const [language, setLanguage] = useState('hi');
  const [patientId, setPatientId] = useState('');

  // Auto-start new patient session when a patient logs in or starts over
  const startNewPatientSession = async (userObj) => {
    try {
      const res = await fetch('/api/session/start', { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        const activePid = userObj?.patient_id || data.patient_id;
        setPatientId(activePid);
      }
    } catch (e) {
      console.log('Session start fallback');
    }
  };

  const handleLoginSuccess = (userData) => {
    setCurrentUser(userData);
    setCurrentStep(1);
    if (userData.role === 'patient') {
      const activePid = userData.patient_id || userData.user_id;
      setPatientId(activePid);
    }
  };

  const handleLogout = () => {
    setCurrentUser(null);
    setCurrentStep(1);
    setPatientId('');
  };

  const handleStartOverKiosk = async () => {
    setCurrentStep(1);
    await startNewPatientSession(currentUser);
  };

  const handleStartIntake = (verifiedAbhaId) => {
    if (verifiedAbhaId) setPatientId(verifiedAbhaId);
    setCurrentStep(2);
  };

  const handleIntakeComplete = () => {
    setCurrentStep(3);
  };

  const handleDocumentsNext = () => {
    setCurrentStep(4);
  };

  // If not logged in, show Auth Page
  if (!currentUser) {
    return <AuthPage onLoginSuccess={handleLoginSuccess} />;
  }

  return (
    <div className="kiosk-container">
      {/* Top Header Bar */}
      <Header 
        currentUser={currentUser}
        language={language}
        onLanguageChange={setLanguage}
        onLogout={handleLogout}
      />

      {/* Main App Body */}
      <main className="kiosk-main">
        {currentUser.role === 'doctor' ? (
          /* Physician Dashboard */
          <ModuleCPhysicianView 
            patientId={patientId}
            currentUser={currentUser}
          />
        ) : (
          /* Patient Kiosk Flow */
          <>
            {/* Step Progress Navigation Bar */}
            <div className="step-nav">
              <div 
                className={`step-item ${currentStep === 1 ? 'active' : ''} ${currentStep > 1 ? 'completed' : ''}`}
                onClick={() => setCurrentStep(1)}
              >
                <div className="step-number">{currentStep > 1 ? <CheckCircle2 size={18} /> : '1'}</div>
                <div className="step-label">1. ABHA & Consent</div>
              </div>

              <div style={{ flex: 1, height: '2px', background: 'var(--border-color)', margin: '0 12px' }} />

              <div 
                className={`step-item ${currentStep === 2 ? 'active' : ''} ${currentStep > 2 ? 'completed' : ''}`}
                onClick={() => setCurrentStep(2)}
              >
                <div className="step-number">{currentStep > 2 ? <CheckCircle2 size={18} /> : '2'}</div>
                <div className="step-label">2. Case Intake</div>
              </div>

              <div style={{ flex: 1, height: '2px', background: 'var(--border-color)', margin: '0 12px' }} />

              <div 
                className={`step-item ${currentStep === 3 ? 'active' : ''} ${currentStep > 3 ? 'completed' : ''}`}
                onClick={() => setCurrentStep(3)}
              >
                <div className="step-number">{currentStep > 3 ? <CheckCircle2 size={18} /> : '3'}</div>
                <div className="step-label">3. Documents & OCR</div>
              </div>

              <div style={{ flex: 1, height: '2px', background: 'var(--border-color)', margin: '0 12px' }} />

              <div 
                className={`step-item ${currentStep === 4 ? 'active' : ''}`}
                onClick={() => setCurrentStep(4)}
              >
                <div className="step-number">4</div>
                <div className="step-label">4. Intake Completion</div>
              </div>
            </div>

            {/* View Router Render */}
            {currentStep === 1 && (
              <ModuleDConsent 
                language={language}
                onLanguageChange={setLanguage}
                onStartIntake={handleStartIntake}
                sessionData={{ patientId }}
              />
            )}

            {currentStep === 2 && (
              <ModuleAIntake 
                patientId={patientId}
                language={language}
                onComplete={handleIntakeComplete}
              />
            )}

            {currentStep === 3 && (
              <ModuleBDocuments 
                patientId={patientId}
                onNext={handleDocumentsNext}
              />
            )}

            {currentStep === 4 && (
              <KioskComplete 
                patientId={patientId}
                onStartOver={handleStartOverKiosk}
                onLogout={handleLogout}
              />
            )}
          </>
        )}
      </main>
    </div>
  );
}
