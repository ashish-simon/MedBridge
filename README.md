# MediBridge

> An intelligent, bilingual patient intake kiosk and physician dashboard designed for high-volume outpatient hospital departments (OPDs). Built for the Ministry of Ayush and the All India Institute of Ayurveda (AIIA).

---

## 📌 Overview

MediKiosk streamlines hospital OPD queues by capturing detailed patient clinical histories and digitizing past medical records before the patient enters the consultation room.

Patients interact with the kiosk using voice or touch in **Hindi, Telugu, or English**. The system asks relevant clinical questions, scans uploaded prescriptions or lab reports, and synthesizes everything into a structured summary for the attending doctor.

---

## ✨ Features & Modules

### 1. Patient Consent & Privacy (Module D)
- **Clear Data Governance**: Explains data collection and privacy terms clearly to patients.
- **Audio Autoplay**: Spoken consent audio automatically plays via Bhashini TTS when loaded.
- **Support for Minors**: Optional guardian confirmation for minor patients.

### 2. Conversational Clinical Intake (Module A)
- **Voice & Touch Experience**: Natural speech interaction powered by Bhashini ASR and TTS.
- **SOCRATES & AYUSH Framework**: Gathers comprehensive details about symptoms (onset, duration, severity, character, aggravating/relieving factors) and Ayurvedic parameters.
- **Medical & Lifestyle History**: Automatically asks about past medical/surgical history, current medications, drug allergies, family history, and lifestyle habits.
- **Safety Screening**: Automatic red-flag detection for immediate triage if severe symptoms (such as cardiac or stroke indicators) are mentioned.

### 3. Medical Document Digitization (Module B)
- **Multi-File Upload**: Patients can upload multiple prescriptions, lab test reports, or discharge summaries at once.
- **AI-Powered OCR**: Uses PaddleOCR and Gemini Vision to read printed or handwritten medical records.
- **Timeline & Abnormal Flags**: Organizes records chronologically and highlights out-of-range lab results as **ABNORMAL**.

### 4. Physician Dashboard & Summary (Module C)
- **Standard Clinical Summary**: Combines spoken patient history and scanned records into a structured clinical note:
  - Chief Complaint
  - History of Present Illness (HPI)
  - Past Medical & Surgical History
  - Drug Allergies & Current Medications
  - Family & Personal Lifestyle History
  - Review of Systems (ROS)
  - Prior Investigations & Lab Summary
- **Interoperability Coding**: Computes relevant SNOMED-CT, ICD-11, LOINC, and NAMASTE codes.
- **OPD Queue & Editing**: Doctors can search patients, review notes, listen to spoken audio summaries, and make inline edits or sign-offs.

### 5. Role-Based Login & Kiosk Reset
- **Separate Portals**: Password-protected login and registration for Patients and Doctors.
- **Kiosk Reset**: After completing intake, patients can review their submitted info, and the kiosk can be reset for the next patient.

---

## 🛠️ How to Run Locally

### Prerequisites
- Python 3.10+
- Node.js 18+

### 1. Backend (FastAPI)
```bash
cd backend
pip install -r requirements.txt
cp .env.example .env   # Add your Gemini & Bhashini API keys in .env
uvicorn main:app --reload --port 8000
```
API Documentation: `http://localhost:8000/docs`

### 2. Frontend (React + Vite)
```bash
cd frontend
npm install
npm run dev
```
Open in browser: `http://localhost:5173`

---

## 📁 Project Structure

```
├── backend/
│   ├── main.py                  # FastAPI entrypoint
│   ├── common/                  # Database (SQLite/PostgreSQL), Auth, Session management
│   ├── module_a/                # Conversational AI & Bhashini speech integration
│   ├── module_b/                # Document OCR & entity extraction
│   ├── module_c/                # Clinical summary generator & medical coding
│   └── module_d/                # Patient consent & privacy
├── frontend/
│   ├── src/
│   │   ├── App.jsx              # Application router
│   │   ├── components/
│   │   │   ├── AuthPage.jsx            # Patient & Doctor password login/registration
│   │   │   ├── Header.jsx              # Kiosk header with language selection
│   │   │   ├── ModuleDConsent.jsx      # Privacy & data consent
│   │   │   ├── ModuleAIntake.jsx       # Voice & touch intake interview
│   │   │   ├── ModuleBDocuments.jsx    # Document upload & OCR scanner
│   │   │   ├── ModuleCPhysicianView.jsx# Physician OPD dashboard
│   │   │   └── KioskComplete.jsx       # Patient completion screen
```
