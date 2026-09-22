# MediKiosk — Multimodal Clinical Intake & Intelligence Platform

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fashish-simon%2FMedikiosk)
[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/ashish-simon/Medikiosk)

> **Patient-Facing Kiosk & Physician Dashboard for High-Density Indian Hospital OPDs**  
> Developed for Ministry of Ayush / All India Institute of Ayurveda (AIIA).

---

## 🌐 Live Website Links & Deployment

- **GitHub Repository**: [https://github.com/ashish-simon/Medikiosk](https://github.com/ashish-simon/Medikiosk)
- **Live Vercel Deployment**: [https://medikiosk-app.vercel.app](https://medikiosk-app.vercel.app) *(or deploy instantly using the Vercel/Render buttons above)*

---

## 🚀 Key Modules & Architecture

### Module A — Conversational Multimodal History Engine
- **Indic Voice & Touch Interface**: Native integration with **Bhashini ASR & TTS** endpoints (Hindi, Telugu, English, Tamil, Kannada, Marathi, Bengali, Gujarati).
- **SOCRATES & AYUSH Framework**: Structured history acquisition following SOCRATES (Site, Onset, Character, Radiation, Associations, Timing, Exacerbating/Relieving, Severity) and AYUSH Dashavidha Pariksha parameters.
- **Phase 2 History Sequence**: Systematically collects past medical/surgical history, current medications, drug & food allergies, family history, and personal lifestyle habits.
- **Deterministic Red-Flag Screening**: Immediate triage detection for cardiac, stroke, and severe respiratory symptoms.

### Module B — Medical Document Digitization & Intelligence
- **Multimodal OCR Pipeline**: Powered by **PaddleOCR** and **Gemini Vision** (`gemini-3.1-flash-lite`, `gemini-3.7-flash`).
- **Batch Multi-File Upload**: Allows patients to upload multiple prescriptions, lab reports, and discharge summaries simultaneously.
- **Chronological Timeline & Abnormal Highlighting**: Orders documents by date and flags out-of-range lab results as **`ABNORMAL`**.

### Module C — Structured History Summary Generator & Interoperability Coding
- **Standard Clinical Format**: Synthesizes conversational narration and OCR findings into:
  $$\text{Chief complaint} \rightarrow \text{HPI} \rightarrow \text{Past medical/surgical} \rightarrow \text{Drug \& allergy} \rightarrow \text{Family} \rightarrow \text{Personal} \rightarrow \text{ROS} \rightarrow \text{Prior investigations summary}$$
- **Dynamic Interoperability Coding**: Real-time mapping to **SNOMED-CT**, **ICD-11**, **LOINC**, and **NAMASTE** codes.
- **Physician Dashboard Queue**: Logged-in doctors can search patients by ID or symptom, inspect full summaries, listen to Indic audio summaries, and perform inline amendments.

### Module D & Auth Layer — Consent & Access Control
- **Role-Based Authentication**: Secure password login and registration for **Doctor** and **Patient** roles (PBKDF2 SHA-256 password hashing).
- **Bhashini Consent Autoplay**: Hands-free Indications consent audio playback on modal open.
- **Patient Kiosk Ending Screen**: Reassuring intake completion view (`KioskComplete.jsx`) with summary review and **Start Kiosk for Next Patient** reset capability.

---

## 🛠️ Local Development & Running

### Prerequisites
- Python 3.10+
- Node.js 18+

### 1. Backend Setup (FastAPI)
```bash
cd backend
pip install -r requirements.txt
cp .env.example .env   # Update with your Gemini & Bhashini API keys
uvicorn main:app --reload --port 8000
```
- Interactive API explorer available at: `http://localhost:8000/docs`

### 2. Frontend Setup (React + Vite)
```bash
cd frontend
npm install
npm run dev
```
- Open browser at: `http://localhost:5173`

---

## 📂 Repository Structure
```
├── backend/
│   ├── main.py                  # FastAPI app entrypoint
│   ├── common/                  # Session, Auth router, DB layers (SQLite / PostgreSQL)
│   ├── module_a/                # Conversational LLM, Bhashini speech, SOCRATES state
│   ├── module_b/                # PaddleOCR + Gemini Vision OCR document intelligence
│   ├── module_c/                # Clinical summary synthesis & interoperability coding
│   └── module_d/                # Consent, ABHA & FHIR stubs
├── frontend/
│   ├── src/
│   │   ├── App.jsx              # Main App router
│   │   ├── components/
│   │   │   ├── AuthPage.jsx            # Password Login / Registration (Doctor & Patient)
│   │   │   ├── Header.jsx              # App header with user profile & language switcher
│   │   │   ├── ModuleDConsent.jsx      # Consent & ABHA verification
│   │   │   ├── ModuleAIntake.jsx       # Conversational case intake UI
│   │   │   ├── ModuleBDocuments.jsx    # Multi-file OCR document uploader
│   │   │   ├── ModuleCPhysicianView.jsx# OPD Doctor Dashboard & Patient Queue
│   │   │   └── KioskComplete.jsx       # Patient Kiosk completion & reset view
├── vercel.json                  # Vercel deployment configuration
├── render.yaml                  # Render.com web service configuration
└── README.md
```
