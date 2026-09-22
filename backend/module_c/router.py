"""
Module C — Structured History Summary Generator & Interoperability Coding
Synthesizes Module A (Conversational History) and Module B (Digitized Documents)
into a standard clinical format (Chief Complaint -> HPI -> Past Medical/Surgical ->
Drug & Allergy -> Family -> Personal -> ROS -> Prior Investigations Summary).
"""
import json
import os
import re
from pathlib import Path
from typing import Any, Dict, List, Optional

import requests
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from common.db import (
    fetch_module_a_history,
    fetch_module_b_documents,
    fetch_module_c_summary,
    insert_module_c_summary,
)
from module_a.conversation import get_session_state, get_session

router = APIRouter()


class SummaryRequest(BaseModel):
    patient_id: str


def get_gemini_api_key() -> str:
    """Resolve Module C Gemini API key with fallback hierarchy."""
    return (
        os.getenv("GEMINI_API_KEY_MODULE_C")
        or os.getenv("GEMINI_API_KEY")
        or os.getenv("GOOGLE_API_KEY")
        or ""
    )


def resolve_module_a_data(patient_id: str) -> dict:
    """Fetches real Module A intake history from DB / memory for patient_id."""
    # 1. Try DB first
    try:
        db_hist = fetch_module_a_history(patient_id)
        if db_hist and db_hist.get("extracted"):
            ext = db_hist["extracted"]
            return {
                "patient_id": patient_id,
                "language": db_hist.get("language", "en"),
                "mode": db_hist.get("mode", "standard"),
                "chief_complaint": ext.get("chief_complaint"),
                "hpi": ext.get("hpi", {}),
                "past_medical_history": ext.get("past_medical_history", []),
                "past_surgical_history": ext.get("past_surgical_history", []),
                "drug_allergy_history": ext.get("drug_allergy_history", []),
                "family_history": ext.get("family_history", []),
                "personal_history": ext.get("personal_history", []),
                "review_of_systems": ext.get("review_of_systems", []),
                "ayush": ext.get("ayush", {}),
                "red_flag_detected": db_hist.get("red_flag_detected", False),
                "red_flag_reason": db_hist.get("red_flag_reason")
            }
    except Exception as e:
        print(f"[Module C DB Intake Fetch Warning] {e}")

    # 2. Try in-memory active session
    session = get_session(patient_id)
    if session:
        state = session.get("state", {})
        return {
            "patient_id": patient_id,
            "language": session.get("language", "en"),
            "mode": session.get("mode", "standard"),
            "chief_complaint": state.get("chief_complaint"),
            "hpi": state.get("hpi", {}),
            "past_medical_history": state.get("past_medical_history", []),
            "past_surgical_history": state.get("past_surgical_history", []),
            "drug_allergy_history": state.get("drug_allergy_history", []),
            "family_history": state.get("family_history", []),
            "personal_history": state.get("personal_history", []),
            "review_of_systems": state.get("review_of_systems", []),
            "ayush": state.get("ayush", {}),
            "red_flag_detected": session.get("red_flag_detected", False),
            "red_flag_reason": session.get("red_flag_reason")
        }

    # 3. Clean empty fallback for unsaved sessions
    return {
        "patient_id": patient_id,
        "language": "en",
        "mode": "standard",
        "chief_complaint": None,
        "hpi": {},
        "past_medical_history": [],
        "past_surgical_history": [],
        "drug_allergy_history": [],
        "family_history": [],
        "personal_history": [],
        "review_of_systems": [],
        "ayush": {},
        "red_flag_detected": False,
        "red_flag_reason": None
    }


def resolve_module_b_data(patient_id: str) -> dict:
    """Fetches real Module B digitized document records for patient_id."""
    try:
        db_docs = fetch_module_b_documents(patient_id)
        if db_docs:
            all_diagnoses = []
            all_medications = []
            all_investigations = []
            for doc in db_docs:
                for d in doc.get("diagnoses", []):
                    if d and str(d).strip() not in all_diagnoses:
                        all_diagnoses.append(str(d).strip())
                for m in doc.get("medications", []):
                    if isinstance(m, dict) and m.get("name"):
                        all_medications.append(m)
                for inv in doc.get("investigations", []):
                    if isinstance(inv, dict) and inv.get("test_name"):
                        all_investigations.append(inv)
            return {
                "patient_id": patient_id,
                "document_count": len(db_docs),
                "diagnoses": all_diagnoses,
                "medications": all_medications,
                "investigations": all_investigations,
                "documents": db_docs
            }
    except Exception as e:
        print(f"[Module C DB Document Fetch Warning] {e}")

    return {
        "patient_id": patient_id,
        "document_count": 0,
        "diagnoses": [],
        "medications": [],
        "investigations": [],
        "documents": []
    }


def _extract_val(field: Any) -> str:
    """Extract string value from FieldValue dict or plain string."""
    if isinstance(field, dict):
        return str(field.get("value") or "").strip()
    if field is not None:
        return str(field).strip()
    return ""


def derive_interoperability_codes(cc_text: str, diagnoses: List[str], ayush: dict) -> dict:
    """Derive dynamic SNOMED, ICD-11, LOINC, and NAMASTE codes based on actual patient findings."""
    combined = (cc_text + " " + " ".join(diagnoses)).lower()

    # SNOMED-CT & ICD-11 mappings based on keywords
    snomed_code = "22253000 | Pain |"
    icd_code = "R52 | Pain, unspecified |"

    if any(k in combined for k in ["fever", "temperature", "chills"]):
        snomed_code = "386661006 | Fever |"
        icd_code = "MG26 | Fever of unknown origin |"
    elif any(k in combined for k in ["cough", "cold", "sore throat", "sneeze"]):
        snomed_code = "49727002 | Cough |"
        icd_code = "CA40 | Upper respiratory tract infection |"
    elif any(k in combined for k in ["knee", "joint", "arthrit"]):
        snomed_code = "239720000 | Right knee pain |"
        icd_code = "FB52.0 | Osteoarthritis of knee |"
    elif any(k in combined for k in ["headache", "head pain", "migraine"]):
        snomed_code = "25064002 | Headache |"
        icd_code = "8A80 | Headache disorders |"
    elif any(k in combined for k in ["stomach", "abdominal", "belly", "gastric"]):
        snomed_code = "21522000 | Abdominal pain |"
        icd_code = "MD81 | Abdominal pain |"
    elif any(k in combined for k in ["diabet", "sugar", "hba1c"]):
        snomed_code = "73211009 | Diabetes mellitus |"
        icd_code = "5A11 | Type 2 diabetes mellitus |"
    elif any(k in combined for k in ["hypertens", "high bp", "pressure"]):
        snomed_code = "38341003 | Essential hypertension |"
        icd_code = "BA00 | Essential hypertension |"

    # LOINC codes for common lab tests
    loinc_codes = []
    if any(k in combined for k in ["sugar", "glucose", "hba1c"]):
        loinc_codes.append("4548-4 | HbA1c in Blood |")
    if any(k in combined for k in ["creatinine", "kidney", "renal"]):
        loinc_codes.append("2160-0 | Serum Creatinine |")
    if any(k in combined for k in ["hemoglobin", "blood", "cbc", "anemia"]):
        loinc_codes.append("718-7 | Hemoglobin in Blood |")
    if not loinc_codes:
        loinc_codes = ["26464-8 | Leukocytes in Blood |"]

    # NAMASTE AYUSH codes
    namc_code = "NAMC-GENERAL-001 | General Health Evaluation |"
    nsmc_code = "NSMC-DOSHA-VATA | Vata Assessment |"
    vikriti = _extract_val(ayush.get("vikriti"))
    if vikriti:
        namc_code = f"NAMC-VIKRITI-001 | {vikriti} |"
    prakriti = _extract_val(ayush.get("prakriti"))
    if prakriti:
        nsmc_code = f"NSMC-PRAKRITI-001 | {prakriti} |"

    return {
        "snomed_ct": [snomed_code],
        "icd_10_11": [icd_code],
        "loinc": loinc_codes,
        "namaste": [namc_code, nsmc_code]
    }


def build_fallback_summary(patient_id: str, mod_a: dict, mod_b: Optional[dict]) -> dict:
    """Builds a structured clinical summary directly from Module A & B data without mock fallbacks."""
    hpi_raw = mod_a.get("hpi", {})
    ayush_raw = mod_a.get("ayush", {})
    
    cc = _extract_val(mod_a.get("chief_complaint")) or "Outpatient Assessment"

    hpi_dict = {
        "onset": _extract_val(hpi_raw.get("onset")),
        "character": _extract_val(hpi_raw.get("character")),
        "duration": _extract_val(hpi_raw.get("timing")),
        "aggravating_factors": _extract_val(hpi_raw.get("aggravating_factors")),
        "relieving_factors": _extract_val(hpi_raw.get("relieving_factors")),
        "radiation": _extract_val(hpi_raw.get("radiation")),
        "severity": _extract_val(hpi_raw.get("severity")),
        "site": _extract_val(hpi_raw.get("site")),
        "associations": _extract_val(hpi_raw.get("associations"))
    }

    # Format HPI text line
    hpi_parts = [f"{k.capitalize().replace('_', ' ')}: {v}" for k, v in hpi_dict.items() if v]
    hpi_str = "; ".join(hpi_parts) if hpi_parts else "Symptom exploration recorded."

    # Past Medical & Surgical
    pmh = mod_a.get("past_medical_history", [])
    psh = mod_a.get("past_surgical_history", [])
    b_diag = mod_b.get("diagnoses", []) if mod_b else []
    
    combined_pmh = list(set(pmh + b_diag))
    past_medical_surgical_str = ""
    if combined_pmh:
        past_medical_surgical_str += "Medical: " + ", ".join(combined_pmh)
    if psh:
        past_medical_surgical_str += (" | " if past_medical_surgical_str else "") + "Surgical: " + ", ".join(psh)
    if not past_medical_surgical_str:
        past_medical_surgical_str = "No past medical/surgical history reported."

    # Drug & Allergy
    allergies = mod_a.get("drug_allergy_history", [])
    b_meds = mod_b.get("medications", []) if mod_b else []
    b_med_strs = [f"{m.get('name')} ({m.get('dosage')})" for m in b_meds if isinstance(m, dict) and m.get("name")]
    
    drug_allergy_str = ""
    if allergies:
        drug_allergy_str += "Allergies: " + ", ".join(allergies)
    else:
        drug_allergy_str += "No known drug allergies reported."
    if b_med_strs:
        drug_allergy_str += " | Active Medications: " + ", ".join(b_med_strs)

    # Family & Personal
    fam = mod_a.get("family_history", [])
    family_str = ", ".join(fam) if fam else "No significant family history reported."

    pers = mod_a.get("personal_history", [])
    personal_str = ", ".join(pers) if pers else "Diet and personal habits reported unremarkable."

    ros = mod_a.get("review_of_systems", [])
    ros_str = ", ".join(ros) if ros else "Unremarkable."

    # Module B Investigations Summary
    b_invs = mod_b.get("investigations", []) if mod_b else []
    inv_parts = []
    for inv in b_invs:
        if isinstance(inv, dict) and inv.get("test_name"):
            tname = inv.get("test_name")
            val = inv.get("value", "")
            ref = inv.get("reference_range", "")
            flag = " [ABNORMAL]" if inv.get("flagged_abnormal") else ""
            inv_parts.append(f"{tname}: {val} (Ref: {ref}){flag}")
    prior_investigations_str = "; ".join(inv_parts) if inv_parts else "No prior lab investigation reports digitized."

    # AYUSH dict
    ayush_dict = {k: _extract_val(v) for k, v in ayush_raw.items()} if isinstance(ayush_raw, dict) else {}

    # Derived interoperability codes
    codes = derive_interoperability_codes(cc, b_diag, ayush_dict)

    # Bilingual patient narration
    lang = mod_a.get("language", "en")
    narration = f"मुख्य समस्या: {cc}. विवरण: {hpi_dict.get('character') or hpi_dict.get('onset') or 'समीक्षा जारी'}." if lang == "hi" else f"Chief Complaint: {cc}. History: {hpi_str}."

    return {
        "patient_id": patient_id,
        "summary_language": lang,
        "bilingual_patient_narration_hindi": narration,
        "chief_complaint": cc,
        "snomed_ct_code": codes["snomed_ct"][0],
        "icd11_code": codes["icd_10_11"][0],
        "hpi": hpi_dict,
        "hpi_summary": hpi_str,
        "past_medical_history": combined_pmh,
        "past_medical_surgical": past_medical_surgical_str,
        "past_surgical_history": psh,
        "drug_allergy_history": allergies,
        "drug_allergy": drug_allergy_str,
        "family_history": family_str,
        "personal_history": personal_str,
        "review_of_systems": ros_str,
        "prior_investigations_summary": prior_investigations_str,
        "loinc_codes": codes["loinc"],
        "ayush": ayush_dict,
        "namaste_codes": {
            "namc_code": codes["namaste"][0],
            "nsmc_code": codes["namaste"][1]
        },
        "coding": codes,
        "physician_action": {
            "status": "pending",
            "physician_notes": "",
            "reviewed_at": None
        },
        "editable": True
    }


def generate_summary_with_gemini(patient_id: str, mod_a: dict, mod_b: Optional[dict]) -> dict:
    """Invokes Gemini API to synthesize conversational intake & digitized documents into physician summary."""
    api_key = get_gemini_api_key()
    if not api_key:
        return build_fallback_summary(patient_id, mod_a, mod_b)

    system_prompt = """
    You are Module C structured clinical history summary generator for MediKiosk.
    Synthesize the patient's conversational history (Module A) AND digitized medical documents (Module B) into a single, concise, physician-ready clinical summary in standard format:
    Chief complaint -> HPI -> Past medical/surgical -> Drug & allergy -> Family -> Personal -> ROS -> Prior investigations summary.

    Respond strictly in valid JSON matching this schema:
    {
      "patient_id": "string",
      "summary_language": "en" | "hi" | "te",
      "bilingual_patient_narration_hindi": "string summary in patient language for audio narration",
      "chief_complaint": "string",
      "hpi": {
        "onset": "string",
        "character": "string",
        "duration": "string",
        "aggravating_factors": "string",
        "relieving_factors": "string",
        "radiation": "string",
        "severity": "string"
      },
      "past_medical_surgical": "string",
      "drug_allergy": "string",
      "family_history": "string",
      "personal_history": "string",
      "review_of_systems": "string",
      "prior_investigations_summary": "string summarizing lab reports and out-of-range values",
      "coding": {
        "snomed_ct": ["string (code | term |)"],
        "icd_10_11": ["string (code | term |)"],
        "loinc": ["string (code | test |)"],
        "namaste": ["string"]
      },
      "editable": true
    }
    Rules:
    - Do NOT invent imaginary symptoms or medical diagnoses not supported by Module A or B.
    - Highlight out-of-range lab test values from Module B clearly in prior_investigations_summary.
    - Return ONLY valid JSON.
    """

    user_prompt = f"Module A Data:\n{json.dumps(mod_a, indent=2, ensure_ascii=False)}\n\nModule B Data:\n{json.dumps(mod_b or {}, indent=2, ensure_ascii=False)}"

    models_to_try = ["gemini-3.1-flash-lite", "gemini-3.7-flash"]
    for model_name in models_to_try:
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{model_name}:generateContent"
        headers = {"Content-Type": "application/json", "x-goog-api-key": api_key}
        payload = {
            "contents": [{"role": "user", "parts": [{"text": system_prompt + "\n\n" + user_prompt}]}],
            "generationConfig": {"temperature": 0.1, "responseMimeType": "application/json"}
        }
        try:
            res = requests.post(url, json=payload, headers=headers, timeout=25)
            if res.status_code == 200:
                data = res.json()
                text = data["candidates"][0]["content"]["parts"][0]["text"]
                parsed = json.loads(text.strip().strip("```json").strip("```"))
                
                fallback = build_fallback_summary(patient_id, mod_a, mod_b)
                fallback.update(parsed)
                return fallback
            else:
                print(f"[Module C Gemini Error ({model_name})] HTTP {res.status_code}: {res.text}")
        except Exception as e:
            print(f"[Module C Gemini Warning ({model_name})] {e}")

    return build_fallback_summary(patient_id, mod_a, mod_b)


@router.post("/generate")
def generate_summary_endpoint(req: SummaryRequest):
    """POST /api/module-c/generate — generates physician summary for a patient."""
    mod_a = resolve_module_a_data(req.patient_id)
    mod_b = resolve_module_b_data(req.patient_id)
    res = generate_summary_with_gemini(req.patient_id, mod_a, mod_b)
    insert_module_c_summary(req.patient_id, res)
    return res


@router.get("/summary/{patient_id}")
@router.post("/summary/{patient_id}")
def get_summary_by_patient_id(patient_id: str):
    """GET/POST /api/module-c/summary/{patient_id} — invoked by React Physician View dashboard."""
    existing = fetch_module_c_summary(patient_id)
    if existing:
        return existing
    mod_a = resolve_module_a_data(patient_id)
    mod_b = resolve_module_b_data(patient_id)
    res = generate_summary_with_gemini(patient_id, mod_a, mod_b)
    insert_module_c_summary(patient_id, res)
    return res


@router.get("/sample-output")
def sample_output():
    """GET /api/module-c/sample-output — returns sample output structure."""
    mod_a = resolve_module_a_data("sample_patient_001")
    mod_b = resolve_module_b_data("sample_patient_001")
    return build_fallback_summary("sample_patient_001", mod_a, mod_b)