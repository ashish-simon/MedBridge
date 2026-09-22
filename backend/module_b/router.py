"""
Module B — Medical Document Digitization & Intelligence (PaddleOCR + Gemini Structuring)
"""
import base64
import json
import os
import re
import uuid
from datetime import datetime
from pathlib import Path
from typing import Any, List, Optional, Tuple

import requests
from dotenv import load_dotenv
from fastapi import APIRouter, File, HTTPException, UploadFile
from pydantic import BaseModel, ConfigDict

from common.db import fetch_module_b_documents, insert_module_b_document
from .association import (
    get_patient_document_ids,
    save_document_association,
)

load_dotenv()

router = APIRouter()

# ============================================================
# PATHS
# ============================================================

MODULE_B_DIR = Path(__file__).resolve().parent
STORAGE_DIR = MODULE_B_DIR / "storage"
DOCUMENTS_DIR = STORAGE_DIR / "documents"
RECORDS_DIR = STORAGE_DIR / "records"

DOCUMENTS_DIR.mkdir(parents=True, exist_ok=True)
RECORDS_DIR.mkdir(parents=True, exist_ok=True)


# ============================================================
# PYDANTIC MODELS
# ============================================================

class Medication(BaseModel):
    model_config = ConfigDict(extra="ignore")

    name: str
    dosage: str


class Investigation(BaseModel):
    model_config = ConfigDict(extra="ignore")

    test_name: str
    value: str
    reference_range: str
    flagged_abnormal: bool


class ModuleBOutput(BaseModel):
    model_config = ConfigDict(extra="ignore")

    document_id: str
    document_type: str
    document_date: str
    raw_ocr_text: Optional[str] = None
    diagnoses: list[str]
    medications: list[Medication]
    investigations: list[Investigation]


# Lazy PaddleOCR instance
_ocr_engine = None


def get_ocr_engine():
    """Lazily load PaddleOCR engine on demand."""
    global _ocr_engine
    if _ocr_engine is None:
        try:
            from paddleocr import PaddleOCR
            _ocr_engine = PaddleOCR(
                lang="en",
                use_angle_cls=False,
                show_log=False,
            )
        except Exception as e:
            print(f"[Module B PaddleOCR Info] PaddleOCR not available or failed: {e}")
            _ocr_engine = None
    return _ocr_engine


def extract_ocr_text(image_path: Path) -> str:
    """Run OCR (Pytesseract / PIL / PaddleOCR) on uploaded medical document image."""
    # 1. Try pytesseract with PIL
    try:
        from PIL import Image
        import pytesseract
        img = Image.open(image_path)
        text = pytesseract.image_to_string(img)
        if text and len(text.strip()) > 5:
            return text.strip()
    except Exception:
        pass

    # 2. Try PaddleOCR engine if available
    engine = get_ocr_engine()
    if engine:
        try:
            result = engine.ocr(str(image_path), cls=False)
            lines: list[str] = []
            if result:
                for line_group in result:
                    if isinstance(line_group, list):
                        for item in line_group:
                            if isinstance(item, list) and len(item) >= 2:
                                text_tuple = item[1]
                                if isinstance(text_tuple, tuple) and len(text_tuple) >= 1:
                                    lines.append(str(text_tuple[0]))
                                elif isinstance(text_tuple, str):
                                    lines.append(text_tuple)
                            elif isinstance(item, dict):
                                text = item.get("text") or item.get("rec_text")
                                if text:
                                    lines.append(str(text))
            if lines:
                return "\n".join(lines)
        except Exception as e:
            print(f"[Module B PaddleOCR Exception] {e}")

    return "[No local OCR text extracted]"


# ============================================================
# ABNORMAL RANGE LOGIC
# ============================================================

def extract_number(value: str) -> Optional[float]:
    """Extract numeric value from string."""
    if not value:
        return None
    cleaned_value = value.replace(",", "")
    match = re.search(r"[-+]?\d+(?:\.\d+)?", cleaned_value)
    if not match:
        return None
    try:
        return float(match.group())
    except ValueError:
        return None


def parse_reference_range(reference_range: str) -> Tuple[str, Optional[float], Optional[float]]:
    """Parse medical reference range string into (op, lower, upper)."""
    if not reference_range:
        return ("unknown", None, None)

    text = reference_range.strip().replace("–", "-").replace("—", "-").replace(",", "")

    # Range: 10 - 20 or 10 to 20
    match = re.search(r"([-+]?\d+(?:\.\d+)?)\s*(?:-|to)\s*([-+]?\d+(?:\.\d+)?)", text, re.IGNORECASE)
    if match:
        return ("range", float(match.group(1)), float(match.group(2)))

    # <= value
    match = re.search(r"<=\s*([-+]?\d+(?:\.\d+)?)", text)
    if match:
        return ("<=", None, float(match.group(1)))

    # >= value
    match = re.search(r">=\s*([-+]?\d+(?:\.\d+)?)", text)
    if match:
        return (">=", float(match.group(1)), None)

    # < value
    match = re.search(r"<\s*([-+]?\d+(?:\.\d+)?)", text)
    if match:
        return ("<", None, float(match.group(1)))

    # > value
    match = re.search(r">\s*([-+]?\d+(?:\.\d+)?)", text)
    if match:
        return (">", float(match.group(1)), None)

    return ("unknown", None, None)


def is_value_abnormal(value: str, reference_range: str) -> bool:
    """Calculates if test value is out of reference range."""
    numeric_value = extract_number(value)
    if numeric_value is None:
        return False

    op, lower, upper = parse_reference_range(reference_range)

    if op == "range":
        if lower is not None and upper is not None:
            return numeric_value < lower or numeric_value > upper
    elif op == "<":
        if upper is not None:
            return numeric_value >= upper
    elif op == "<=":
        if upper is not None:
            return numeric_value > upper
    elif op == ">":
        if lower is not None:
            return numeric_value <= lower
    elif op == ">=":
        if lower is not None:
            return numeric_value < lower

    return False


def apply_abnormal_flags(data: dict[str, Any]) -> dict[str, Any]:
    """Recalculate investigation abnormal flags."""
    investigations = data.get("investigations", [])
    for inv in investigations:
        val = inv.get("value", "")
        ref = inv.get("reference_range", "")
        inv["flagged_abnormal"] = is_value_abnormal(val, ref)
    return data


def get_gemini_api_key() -> str:
    """Resolves Gemini API key with fallback hierarchy."""
    return (
        os.getenv("GEMINI_API_KEY_MODULE_B")
        or os.getenv("GEMINI_API_KEY")
        or os.getenv("GOOGLE_API_KEY")
        or ""
    )


def extract_rule_based_fallback(raw_ocr_text: str) -> dict[str, Any]:
    """Rule-based extraction without fake mock data."""
    lines = [line.strip() for line in raw_ocr_text.splitlines() if line.strip()]
    text_lower = raw_ocr_text.lower()

    doc_type = "prescription"
    if any(k in text_lower for k in ["lab", "blood", "test", "hba1c", "creatinine", "glucose", "report"]):
        doc_type = "lab_report"
    elif any(k in text_lower for k in ["discharge", "admitted", "hospitalization"]):
        doc_type = "discharge_summary"

    date_match = re.search(r"\b(\d{4}-\d{2}-\d{2}|\d{1,2}[/-]\d{1,2}[/-]\d{2,4})\b", raw_ocr_text)
    doc_date = date_match.group(1) if date_match else datetime.now().strftime("%Y-%m-%d")

    diagnoses = []
    diag_match = re.search(r"(?:diagnosis|diagnoses|impression|dx)\s*:\s*(.*)", raw_ocr_text, re.IGNORECASE)
    if diag_match:
        for d in re.split(r"[,;]", diag_match.group(1)):
            if d.strip():
                diagnoses.append(d.strip())

    medications = []
    for line in lines:
        if re.search(r"\b(tab|cap|syrup|mg|ml|od|bd|tid|sos)\b", line, re.IGNORECASE):
            parts = line.split()
            if len(parts) >= 2:
                medications.append({"name": parts[0], "dosage": " ".join(parts[1:])})

    investigations = []
    for line in lines:
        if ":" in line and any(k in line.lower() for k in ["blood", "sugar", "hba1c", "creatinine", "hemoglobin", "glucose", "ref:"]):
            parts = line.split(":", 1)
            tname = parts[0].strip()
            rest = parts[1].strip()
            val_match = re.search(r"([-+]?\d+(?:\.\d+)?\s*[A-Za-z/%]*)\s*(?:\((?:Ref:)?\s*([^)]+)\))?", rest)
            if val_match:
                investigations.append({
                    "test_name": tname,
                    "value": val_match.group(1).strip(),
                    "reference_range": val_match.group(2).strip() if val_match.group(2) else "",
                    "flagged_abnormal": False
                })

    return {
        "document_id": str(uuid.uuid4()),
        "document_type": doc_type,
        "document_date": doc_date,
        "diagnoses": diagnoses,
        "medications": medications,
        "investigations": investigations
    }


def extract_with_gemini_vision(image_path: Path, raw_ocr_text_fallback: str) -> dict[str, Any]:
    """Send document image bytes directly to Gemini Vision API for multimodal OCR & structuring."""
    api_key = get_gemini_api_key()
    
    b64_data = ""
    mime_type = "image/png"
    try:
        img_bytes = image_path.read_bytes()
        ext = image_path.suffix.lower().strip(".")
        if ext in ["jpg", "jpeg"]:
            mime_type = "image/jpeg"
        elif ext in ["webp", "bmp", "tiff", "tif"]:
            mime_type = f"image/{ext}"

        b64_data = base64.b64encode(img_bytes).decode("utf-8")
    except Exception as e:
        print(f"[Module B Image Read Error] {e}")

    system_prompt = """
    You are a medical document OCR & structuring engine for MediKiosk.
    Perform OCR on the provided document image. Extract all printed and handwritten text.
    Convert findings into this exact JSON schema:
    {
      "raw_ocr_text": "all extracted text from document line by line",
      "document_type": "prescription" | "lab_report" | "discharge_summary" | "other",
      "document_date": "YYYY-MM-DD",
      "diagnoses": ["string"],
      "medications": [{"name": "string", "dosage": "string"}],
      "investigations": [{"test_name": "string", "value": "string", "reference_range": "string", "flagged_abnormal": false}]
    }
    Rules:
    - Extract ONLY actual diagnoses, medications, or lab test results written in the document image.
    - Do NOT invent or add imaginary medical data.
    - If date is present, format as YYYY-MM-DD.
    - Return ONLY valid JSON.
    """

    models_to_try = ["gemini-3.1-flash-lite", "gemini-3.7-flash"]
    if api_key and b64_data:
        for model_name in models_to_try:
            url = f"https://generativelanguage.googleapis.com/v1beta/models/{model_name}:generateContent"
            headers = {"Content-Type": "application/json", "x-goog-api-key": api_key}
            payload = {
                "contents": [
                    {
                        "role": "user",
                        "parts": [
                            {"inlineData": {"mimeType": mime_type, "data": b64_data}},
                            {"text": system_prompt}
                        ]
                    }
                ],
                "generationConfig": {"temperature": 0.1, "responseMimeType": "application/json"}
            }

            try:
                res = requests.post(url, json=payload, headers=headers, timeout=30)
                if res.status_code == 200:
                    data = res.json()
                    text = data["candidates"][0]["content"]["parts"][0]["text"]
                    parsed = json.loads(text.strip().strip("```json").strip("```"))
                    if not parsed.get("raw_ocr_text"):
                        parsed["raw_ocr_text"] = raw_ocr_text_fallback or "[Text extracted via Gemini Vision]"
                    return parsed
                else:
                    print(f"[Module B Gemini Vision Error ({model_name})] HTTP {res.status_code}: {res.text}")
            except Exception as e:
                print(f"[Module B Gemini Vision Exception ({model_name})] {e}")

    fallback = extract_rule_based_fallback(raw_ocr_text_fallback)
    fallback["raw_ocr_text"] = raw_ocr_text_fallback or "[No text extracted from document image]"
    return fallback


def save_uploaded_document(file_bytes: bytes, filename: Optional[str]) -> Path:
    """Save uploaded image permanently."""
    ext = ".png"
    if filename:
        orig_ext = Path(filename).suffix.lower()
        if orig_ext in {".png", ".jpg", ".jpeg", ".webp", ".bmp", ".tiff", ".tif"}:
            ext = orig_ext
    doc_name = f"{uuid.uuid4()}{ext}"
    doc_path = DOCUMENTS_DIR / doc_name
    doc_path.write_bytes(file_bytes)
    return doc_path


def save_structured_record(data: dict[str, Any]) -> Path:
    """Save structured record JSON."""
    doc_id = data["document_id"]
    record_path = RECORDS_DIR / f"{doc_id}.json"
    record_path.write_text(json.dumps(data, indent=2), encoding="utf-8")
    return record_path


def process_single_document(file_bytes: bytes, filename: str, patient_id: str) -> dict[str, Any]:
    """Core document processing pipeline for a single file."""
    doc_id = str(uuid.uuid4())
    image_path = save_uploaded_document(file_bytes, filename)
    raw_ocr_text = extract_ocr_text(image_path)
    extracted_data = extract_with_gemini_vision(image_path, raw_ocr_text)

    extracted_data["document_id"] = doc_id
    if not extracted_data.get("raw_ocr_text"):
        extracted_data["raw_ocr_text"] = raw_ocr_text
    extracted_data = apply_abnormal_flags(extracted_data)

    validated_record = ModuleBOutput.model_validate(extracted_data)
    final_record = validated_record.model_dump()

    save_structured_record(final_record)
    save_document_association(patient_id=patient_id, document_id=final_record["document_id"])
    insert_module_b_document(patient_id=patient_id, doc_data=final_record, image_path=str(image_path))

    return final_record


@router.post("/extract", response_model=ModuleBOutput)
async def extract_document(patient_id: str, file: Optional[UploadFile] = File(None)):
    """Module B single medical document OCR & structuring pipeline."""
    if not patient_id.strip():
        raise HTTPException(status_code=400, detail="patient_id cannot be empty.")

    if not file:
        raise HTTPException(status_code=400, detail="No file uploaded. Please select a document file.")

    contents = await file.read()
    if not contents:
        raise HTTPException(status_code=400, detail="Uploaded file is empty.")

    return process_single_document(contents, file.filename or "document.png", patient_id)


@router.post("/extract-multiple")
async def extract_multiple_documents(patient_id: str, files: List[UploadFile] = File(...)):
    """Process multiple uploaded medical documents in batch."""
    if not patient_id.strip():
        raise HTTPException(status_code=400, detail="patient_id cannot be empty.")

    if not files:
        raise HTTPException(status_code=400, detail="No files uploaded.")

    results = []
    for file in files:
        contents = await file.read()
        if contents:
            rec = process_single_document(contents, file.filename or "document.png", patient_id)
            results.append(rec)

    return {
        "patient_id": patient_id,
        "processed_count": len(results),
        "documents": results
    }


@router.get("/timeline")
def get_patient_timeline(patient_id: str):
    """
    Retrieves all stored medical records for patient_id,
    sorted in chronological order, with an aggregated & correlated summary.
    """
    if not patient_id.strip():
        raise HTTPException(status_code=400, detail="patient_id cannot be empty.")

    # Fetch records from database (or file fallback)
    db_records = fetch_module_b_documents(patient_id)
    if not db_records:
        document_ids = get_patient_document_ids(patient_id)
        db_records = []
        for doc_id in document_ids:
            rec_path = RECORDS_DIR / f"{doc_id}.json"
            if rec_path.exists():
                try:
                    rec_data = json.loads(rec_path.read_text(encoding="utf-8"))
                    db_records.append(rec_data)
                except Exception:
                    continue

    # Sort chronologically by document_date
    def parse_doc_date(rec):
        d = rec.get("document_date", "") or ""
        return d.strip()

    sorted_records = sorted(db_records, key=parse_doc_date)

    # Aggregate & correlate findings across all documents
    all_diagnoses_set = set()
    all_diagnoses_list = []
    all_medications = []
    all_investigations = []

    for rec in sorted_records:
        doc_date = rec.get("document_date", "N/A")
        
        # Correlate diagnoses
        for diag in rec.get("diagnoses", []):
            if diag and str(diag).strip() and str(diag).strip().lower() not in all_diagnoses_set:
                all_diagnoses_set.add(str(diag).strip().lower())
                all_diagnoses_list.append(str(diag).strip())

        # Correlate medications
        for med in rec.get("medications", []):
            if isinstance(med, dict) and med.get("name"):
                all_medications.append({
                    "name": med.get("name"),
                    "dosage": med.get("dosage", ""),
                    "source_date": doc_date,
                    "document_id": rec.get("document_id")
                })

        # Correlate investigations
        for inv in rec.get("investigations", []):
            if isinstance(inv, dict) and inv.get("test_name"):
                all_investigations.append({
                    "test_name": inv.get("test_name"),
                    "value": inv.get("value", ""),
                    "reference_range": inv.get("reference_range", ""),
                    "flagged_abnormal": inv.get("flagged_abnormal", False),
                    "source_date": doc_date,
                    "document_id": rec.get("document_id")
                })

    return {
        "patient_id": patient_id,
        "total_documents": len(sorted_records),
        "chronological_records": sorted_records,
        "correlated_summary": {
            "all_diagnoses": all_diagnoses_list,
            "all_medications": all_medications,
            "all_investigations": all_investigations
        }
    }


@router.get("/records")
def get_patient_records(patient_id: str):
    """Retrieve all saved medical records associated with patient_id."""
    return get_patient_timeline(patient_id)