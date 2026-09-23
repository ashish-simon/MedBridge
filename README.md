# MediBridge

> **Multi-Tier Rural Healthcare Continuum Platform**  
> An integrated, AI-powered digital healthcare platform bridging rural patients, frontline community health workers (ASHAs), remote specialist physicians, and tertiary referral hospitals into a synchronized care continuum. Built for the Ministry of Ayush / AIIA Rural Public Healthcare Initiative.

---

## 📌 Overview

**MediBridge** transforms fragmented, paper-based rural healthcare into an end-to-end digital continuum. Designed specifically for low-resource Primary Health Centers (PHCs) and Sub-Centers, the platform features:

- **Illiteracy & Language Inclusivity**: Spoken audio prompts and touch-friendly visual controls in **English, Hindi, and Telugu** powered by MeitY Bhashini AI.
- **Emergency Red-Flag Triage**: Instant detection of acute symptoms (e.g., severe chest pain, dyspnea, stroke indicators) that immediately prioritizes critical patients.
- **Specialist Teleconsultation & Coding**: Auto-generates structured clinical summaries for urban doctors, complete with **SNOMED-CT**, **ICD-11**, **LOINC**, and **NAMASTE AYUSH** codes, with one-click Google Meet video links.
- **Inter-Facility Digital Referral Pass**: Generates trackable referral tokens (`REF-XXXXXX`) bundling patient history, vitals, and target hospital queues.
- **ASHA Frontline Worker App**: Offline-first mobile interface equipping community health workers with doctor-assigned high-risk checklists, red-flag emergency alarms, and low-network batch sync capabilities.
- **100% Real Data & Persistence**: Standardized Patient IDs (`PAT-XXXXXX`) across PostgreSQL and SQLite databases with zero mock data.

---

## ✨ System Architecture & Key Modules

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                        MEDIBRIDGE MULTI-TIER CONTINUUM PLATFORM                        │
└────────────────────────────────────────────────────────────────────────────────────────┘
         │                                 │                                 │
         ▼                                 ▼                                 ▼
┌─────────────────┐               ┌─────────────────┐               ┌─────────────────┐
│  PATIENT KIOSK  │               │  ASHA WORKER    │               │ PHYSICIAN PORTAL│
│  (PHC / Triage) │               │  (Home Visits)  │               │ (Remote / OPD)  │
└────────┬────────┘               └────────┬────────┘               └────────┬────────┘
         │                                 │                                 │
         └─────────────────────────────────┼─────────────────────────────────┘
                                           │
                                           ▼
                       ┌───────────────────────────────────────┐
                       │      FASTAPI CENTRAL API GATEWAY      │
                       │ Red-Flag Engine | Summary Synthesizer │
                       └───────────────────┬───────────────────┘
                                           │
                                           ▼
                       ┌───────────────────────────────────────┐
                       │     POSTGRESQL / SQLITE DATABASE      │
                       │ Unified Patient ID (PAT-XXXXXX) State │
                       └───────────────────────────────────────┘
```

### 1. Patient Kiosk & Conversational AI Intake
- **4-Step Intake Wizard**: Guided workflow (**1. ABHA & Consent $\rightarrow$ 2. AI Voice Interview $\rightarrow$ 3. Medical Document Scanner $\rightarrow$ 4. Live Waiting Room**).
- **Audio Autoplay & Guidance**: Speech output via MeitY Bhashini TTS ensures illiterate and semi-literate patients complete intake independently.
- **Controlled Sequential Navigation**: Prevents unearned step jumps until prior clinical intake stages are completed.

### 2. Emergency Red-Flag Triage Engine
- **Instant Symptom Parsing**: Evaluates incoming symptoms in real time.
- **Priority Escalation**: Acute indicators (chest pain, stroke, severe bleeding) trigger **🚨 Emergency Red-Flag Triage Alerts**, escalating patients to top priority across physician and ASHA dashboards.

### 3. Medical Document Digitization & OCR Scanner (Module B)
- **Paper-to-Digital Conversion**: Scans physical handwritten prescriptions, lab reports, and discharge summaries.
- **Abnormal Value Flagging**: Automatically parses test metrics and highlights out-of-range lab results as **ABNORMAL**.

### 4. Specialist Physician & OPD Portal (Module C)
- **Priority Queue Sorting**: Orders patients automatically: `🚨 Red-Flag Emergency` $\rightarrow$ `⚠️ High Risk` $\rightarrow$ `Standard Intake`.
- **AI Clinical Summary Synthesizer**: Compiles conversational history and OCR records into standardized clinical summaries with SNOMED-CT, ICD-11, and NAMASTE codes.
- **Google Meet Teleconsultation**: Generates dynamic one-click video consultation links connecting doctors directly to PHC patient booths.
- **Digital Referral Generator**: Issues inter-facility digital referral tokens (`REF-XXXXXX`) for tertiary hospital care.
- **ASHA High-Risk Task Assignment**: Assigns post-consultation home visit follow-up tasks directly to the local ASHA worker's daily checklist.

### 5. ASHA Frontline Worker Mobile App (Offline-First)
- **High-Risk Home Visit Checklist**: Displays daily follow-up tasks assigned by doctors.
- **Low-Network Batch Sync**: Saves field visit records locally in low-connectivity areas and syncs to central DB via `POST /api/v1/sync/batch` when online.
- **Red-Flag Emergency Alarm Banner**: Displays real-time alarms for emergency patients in their catchment area with a smooth one-click fade-out dismissal.

### 6. Live Patient Waiting Room & Referral Pass
- **Dynamic Waiting Room Card**: Updates in real time based on remote doctor actions, presenting video consultation buttons or blue/green in-person **Referral Pass Cards**.

---

## 🛠️ How to Run Locally

### Prerequisites
- Python 3.10+
- Node.js 18+

### 1. Backend Setup (FastAPI)
```bash
cd backend
pip install -r requirements.txt

# (Optional) Clean Database Reset
python reset_database.py

# Run FastAPI Server on Port 8000
uvicorn main:app --reload --port 8000
```
- API Explorer & Documentation: `http://localhost:8000/docs`

### 2. Frontend Setup (React + Vite)
```bash
cd frontend
npm install
npm run dev
```
- Open Application in Browser: `http://localhost:3000` or `http://localhost:5173`

---

## 🧪 Verification & Automated Testing

Run the end-to-end integration script to verify DB reset, patient registration (`PAT-XXXXXX`), red-flag triage, physician queue correlation, referral creation, and ASHA task sync:

```bash
cd backend
python test_real_data_flow.py
```

To verify the production frontend build:
```bash
cd frontend
npm run build
```

---

## 📁 Project Structure

```
├── backend/
│   ├── main.py                  # FastAPI entrypoint (MediBridge API)
│   ├── reset_database.py        # Database clean reset utility
│   ├── test_real_data_flow.py   # Real data correlation integration test
│   ├── common/                  # Database (SQLite/PostgreSQL), Auth, Session management
│   ├── module_a/                # Conversational AI & Bhashini speech processing
│   ├── module_b/                # Medical document OCR & vision scanner
│   ├── module_c/                # Structured clinical summary generator & medical coding
│   ├── module_d/                # ABDM ABHA consent & privacy management
│   └── v1/                      # API v1 router (Intake, Referrals, High-Risk Registry, Sync)
├── frontend/
│   ├── src/
│   │   ├── App.jsx              # Application router & multi-role state
│   │   ├── utils/               # Application-wide audio manager (audioManager.js)
│   │   ├── components/
│   │   │   ├── AuthPage.jsx            # Multi-tier role authentication (Patient/ASHA/Doctor/Admin)
│   │   │   ├── Header.jsx              # Kiosk header & language selector (EN/HI/TE)
│   │   │   ├── PatientKioskView.jsx    # 4-step Patient Kiosk & Live Waiting Room
│   │   │   ├── AshaFrontlineView.jsx   # ASHA Worker App & Low-Network Batch Sync
│   │   │   ├── ModuleCPhysicianView.jsx# Specialist Physician OPD Dashboard & Referral Manager
│   │   │   ├── ModuleDConsent.jsx      # Privacy & ABHA consent management
│   │   │   ├── ModuleBDocuments.jsx    # Document upload & OCR scanner
│   │   │   └── AdminDashboardView.jsx  # System analytics & database administration
```
