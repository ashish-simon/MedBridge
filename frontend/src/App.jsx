import React, { useState, useEffect } from 'react';
import Header from './components/Header';
import AuthPage from './components/AuthPage';
import PatientKioskView from './components/PatientKioskView';
import AshaFrontlineView from './components/AshaFrontlineView';
import ModuleCPhysicianView from './components/ModuleCPhysicianView';

export default function App() {
  const [currentUser, setCurrentUser] = useState(null); // { user_id, username, role, full_name, patient_id }
  const [language, setLanguage] = useState('hi'); // Global language constrained to 'en', 'hi', 'te'
  const [patientId, setPatientId] = useState('');

  // Start patient session when a patient logs in or starts over
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
      const fallbackId = userObj?.patient_id || `pat-${Date.now()}`;
      setPatientId(fallbackId);
    }
  };

  const handleLoginSuccess = (userData, selectedLang) => {
    setCurrentUser(userData);
    if (selectedLang) setLanguage(selectedLang);
    if (userData.role === 'patient') {
      const activePid = userData.patient_id || userData.user_id;
      setPatientId(activePid);
    }
  };

  const handleLogout = () => {
    setCurrentUser(null);
    setPatientId('');
  };

  const handleStartOverKiosk = async () => {
    await startNewPatientSession(currentUser);
  };

  // If not logged in, render Auth Portal
  if (!currentUser) {
    return <AuthPage onLoginSuccess={handleLoginSuccess} currentLanguage={language} onLanguageChange={setLanguage} />;
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

      {/* Main View Router based on User Role */}
      <main className="kiosk-main">
        {currentUser.role === 'asha' && (
          <AshaFrontlineView currentUser={currentUser} />
        )}

        {currentUser.role === 'doctor' && (
          <ModuleCPhysicianView patientId={patientId} currentUser={currentUser} />
        )}

        {currentUser.role === 'patient' && (
          <PatientKioskView 
            patientId={patientId}
            language={language}
            onLanguageChange={setLanguage}
            onCompleteKiosk={handleStartOverKiosk}
          />
        )}
      </main>
    </div>
  );
}
