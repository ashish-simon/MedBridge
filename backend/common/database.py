"""
MediKiosk Database Layer — PostgreSQL & SQLite Relational Persistence

Supports PostgreSQL (psycopg2) with fallback to SQLite for local development.
Automatically creates and manages SQL tables for:
- patient_sessions
- intake_records (Module A)
- document_records (Module B)
- clinical_summaries (Module C)
- consent_records (Module D)
"""
import os
import json
from datetime import datetime, timezone
from typing import Dict, Any, List, Optional
from pathlib import Path

from sqlalchemy import (
    create_engine, Column, String, Text, Boolean, DateTime, Integer, inspect
)
from sqlalchemy.orm import declarative_base, sessionmaker

Base = declarative_base()

# ============================================================
# TABLE SCHEMAS
# ============================================================

class PatientSessionModel(Base):
    __tablename__ = "patient_sessions"

    patient_id = Column(String(100), primary_key=True)
    abha_id = Column(String(100), nullable=True)
    language = Column(String(10), default="en")
    session_started_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))


class IntakeRecordModel(Base):
    __tablename__ = "intake_records"

    id = Column(Integer, primary_key=True, autoincrement=True)
    patient_id = Column(String(100), index=True)
    language = Column(String(10), default="en")
    mode = Column(String(20), default="standard")
    chief_complaint = Column(Text, nullable=True)
    hpi_json = Column(Text, nullable=True)
    ayush_json = Column(Text, nullable=True)
    red_flag_detected = Column(Boolean, default=False)
    red_flag_reason = Column(Text, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))


class DocumentRecordModel(Base):
    __tablename__ = "document_records"

    document_id = Column(String(100), primary_key=True)
    patient_id = Column(String(100), index=True)
    document_type = Column(String(50))
    document_date = Column(String(20))
    diagnoses_json = Column(Text, nullable=True)
    medications_json = Column(Text, nullable=True)
    investigations_json = Column(Text, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))


class ClinicalSummaryModel(Base):
    __tablename__ = "clinical_summaries"

    summary_id = Column(String(100), primary_key=True)
    patient_id = Column(String(100), index=True)
    chief_complaint = Column(Text, nullable=True)
    summary_json = Column(Text, nullable=True)
    snomed_ct_code = Column(String(200), nullable=True)
    icd11_code = Column(String(200), nullable=True)
    loinc_codes_json = Column(Text, nullable=True)
    namaste_codes_json = Column(Text, nullable=True)
    physician_status = Column(String(50), default="pending")
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))


class ConsentRecordModel(Base):
    __tablename__ = "consent_records"

    consent_id = Column(String(100), primary_key=True)
    patient_id = Column(String(100), index=True)
    abha_id = Column(String(100), nullable=True)
    consent_given = Column(Boolean, default=True)
    consent_language = Column(String(10), default="en")
    scopes_json = Column(Text, nullable=True)
    is_minor = Column(Boolean, default=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))


# ============================================================
# DATABASE ENGINE SETUP & CONNECTION
# ============================================================

def init_db_engine():
    """Initializes SQLAlchemy engine targeting PostgreSQL or SQLite fallback."""
    pg_url = os.getenv("DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/medikiosk")
    
    # Try PostgreSQL first
    try:
        engine = create_engine(pg_url, pool_pre_ping=True)
        # Test connection
        with engine.connect() as conn:
            pass
        print(f"[Database] Successfully connected to PostgreSQL server: {pg_url.split('@')[-1]}")
        return engine, "postgresql"
    except Exception as e:
        # Fallback to local persistent SQLite
        db_path = Path(__file__).resolve().parents[1] / "medikiosk.db"
        sqlite_url = f"sqlite:///{db_path}"
        engine = create_engine(sqlite_url, connect_args={"check_same_thread": False})
        print(f"[Database] PostgreSQL server not reachable. Using SQLite fallback: {db_path}")
        return engine, "sqlite"


engine, DB_TYPE = init_db_engine()
Base.metadata.create_all(engine)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def get_db():
    """FastAPI dependency for DB session."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# ============================================================
# DATA PERSISTENCE HELPERS
# ============================================================

def db_save_session(patient_id: str, abha_id: Optional[str] = None, language: str = "en") -> dict:
    """Save or update patient session record in SQL DB."""
    db = SessionLocal()
    try:
        session = db.query(PatientSessionModel).filter_by(patient_id=patient_id).first()
        if not session:
            session = PatientSessionModel(
                patient_id=patient_id,
                abha_id=abha_id,
                language=language
            )
            db.add(session)
        else:
            if abha_id:
                session.abha_id = abha_id
            session.language = language
        db.commit()
        return {"patient_id": patient_id, "abha_id": session.abha_id, "db": DB_TYPE}
    except Exception as e:
        db.rollback()
        print(f"[DB Session Error] {e}")
        return {"patient_id": patient_id, "error": str(e)}
    finally:
        db.close()


def db_save_intake(patient_id: str, language: str, mode: str, extracted: dict, red_flag_result: dict) -> bool:
    """Save Module A intake record turn in SQL DB."""
    db = SessionLocal()
    try:
        record = IntakeRecordModel(
            patient_id=patient_id,
            language=language,
            mode=mode,
            chief_complaint=extracted.get("chief_complaint", ""),
            hpi_json=json.dumps(extracted.get("hpi", {})),
            ayush_json=json.dumps(extracted.get("ayush", {})),
            red_flag_detected=bool(red_flag_result.get("detected", False)),
            red_flag_reason=red_flag_result.get("reason")
        )
        db.add(record)
        db.commit()
        return True
    except Exception as e:
        db.rollback()
        print(f"[DB Intake Error] {e}")
        return False
    finally:
        db.close()


def db_save_document(data: dict) -> bool:
    """Save Module B OCR digitized document record in SQL DB."""
    db = SessionLocal()
    try:
        doc_id = data.get("document_id", "")
        doc = db.query(DocumentRecordModel).filter_by(document_id=doc_id).first()
        if not doc:
            doc = DocumentRecordModel(
                document_id=doc_id,
                patient_id=data.get("patient_id", ""),
                document_type=data.get("document_type", "prescription"),
                document_date=data.get("document_date", ""),
                diagnoses_json=json.dumps(data.get("diagnoses", [])),
                medications_json=json.dumps(data.get("medications", [])),
                investigations_json=json.dumps(data.get("investigations", []))
            )
            db.add(doc)
            db.commit()
        return True
    except Exception as e:
        db.rollback()
        print(f"[DB Document Error] {e}")
        return False
    finally:
        db.close()


def db_save_summary(data: dict) -> bool:
    """Save Module C clinical summary record in SQL DB."""
    db = SessionLocal()
    try:
        s_id = data.get("summary_id", f"sum-{data.get('patient_id')}")
        summary = db.query(ClinicalSummaryModel).filter_by(summary_id=s_id).first()
        coding = data.get("coding", {})
        if not summary:
            summary = ClinicalSummaryModel(
                summary_id=s_id,
                patient_id=data.get("patient_id", ""),
                chief_complaint=data.get("chief_complaint", ""),
                summary_json=json.dumps(data),
                snomed_ct_code=str(coding.get("snomed_ct", [""])[0] if coding.get("snomed_ct") else ""),
                icd11_code=str(coding.get("icd_10_11", [""])[0] if coding.get("icd_10_11") else ""),
                loinc_codes_json=json.dumps(coding.get("loinc", [])),
                namaste_codes_json=json.dumps(coding.get("namaste", [])),
                physician_status=data.get("physician_action", {}).get("status", "pending")
            )
            db.add(summary)
            db.commit()
        return True
    except Exception as e:
        db.rollback()
        print(f"[DB Summary Error] {e}")
        return False
    finally:
        db.close()


def db_save_consent(data: dict) -> bool:
    """Save Module D consent record in SQL DB."""
    db = SessionLocal()
    try:
        c_id = f"consent-{data.get('patient_id')}"
        consent = db.query(ConsentRecordModel).filter_by(consent_id=c_id).first()
        if not consent:
            consent = ConsentRecordModel(
                consent_id=c_id,
                patient_id=data.get("patient_id", ""),
                abha_id=data.get("abha_id"),
                consent_given=bool(data.get("consent_given", True)),
                consent_language=data.get("consent_language", "en"),
                scopes_json=json.dumps(data.get("consent_scope", [])),
                is_minor=bool(data.get("is_minor", False))
            )
            db.add(consent)
            db.commit()
        return True
    except Exception as e:
        db.rollback()
        print(f"[DB Consent Error] {e}")
        return False
    finally:
        db.close()


# ============================================================
# DATA RETRIEVAL / QUERY HELPERS
# ============================================================

def db_get_session(patient_id: str) -> Optional[dict]:
    """Query patient session from SQL DB."""
    db = SessionLocal()
    try:
        session = db.query(PatientSessionModel).filter_by(patient_id=patient_id).first()
        if session:
            return {
                "patient_id": session.patient_id,
                "abha_id": session.abha_id,
                "language": session.language,
                "session_started_at": session.session_started_at.isoformat() if session.session_started_at else None
            }
        return None
    except Exception as e:
        print(f"[DB Get Session Error] {e}")
        return None
    finally:
        db.close()


def db_get_intake(patient_id: str) -> Optional[dict]:
    """Query latest Module A intake record from SQL DB."""
    db = SessionLocal()
    try:
        rec = db.query(IntakeRecordModel).filter_by(patient_id=patient_id).order_by(IntakeRecordModel.id.desc()).first()
        if rec:
            hpi = json.loads(rec.hpi_json) if rec.hpi_json else {}
            ayush = json.loads(rec.ayush_json) if rec.ayush_json else {}
            return {
                "patient_id": rec.patient_id,
                "language": rec.language or "en",
                "chief_complaint": rec.chief_complaint or "",
                "hpi": hpi,
                "past_medical_history": [],
                "past_surgical_history": [],
                "drug_allergy_history": [],
                "family_history": [],
                "personal_history": [],
                "review_of_systems": [],
                "ayush": ayush,
                "red_flag_detected": bool(rec.red_flag_detected),
                "red_flag_reason": rec.red_flag_reason
            }
        return None
    except Exception as e:
        print(f"[DB Get Intake Error] {e}")
        return None
    finally:
        db.close()


def db_get_documents(patient_id: str) -> List[dict]:
    """Query all Module B document records for patient_id from SQL DB."""
    db = SessionLocal()
    try:
        docs = db.query(DocumentRecordModel).filter_by(patient_id=patient_id).all()
        result = []
        for d in docs:
            result.append({
                "document_id": d.document_id,
                "patient_id": d.patient_id,
                "document_type": d.document_type,
                "document_date": d.document_date,
                "diagnoses": json.loads(d.diagnoses_json) if d.diagnoses_json else [],
                "medications": json.loads(d.medications_json) if d.medications_json else [],
                "investigations": json.loads(d.investigations_json) if d.investigations_json else []
            })
        return result
    except Exception as e:
        print(f"[DB Get Documents Error] {e}")
        return []
    finally:
        db.close()


def db_get_summary(patient_id: str) -> Optional[dict]:
    """Query latest Module C clinical summary for patient_id from SQL DB."""
    db = SessionLocal()
    try:
        s_id = f"sum-{patient_id}"
        rec = db.query(ClinicalSummaryModel).filter(
            (ClinicalSummaryModel.patient_id == patient_id) | (ClinicalSummaryModel.summary_id == s_id)
        ).first()
        if rec and rec.summary_json:
            return json.loads(rec.summary_json)
        return None
    except Exception as e:
        print(f"[DB Get Summary Error] {e}")
        return None
    finally:
        db.close()


def db_get_consent(patient_id: str) -> Optional[dict]:
    """Query Module D consent record for patient_id from SQL DB."""
    db = SessionLocal()
    try:
        c_id = f"consent-{patient_id}"
        rec = db.query(ConsentRecordModel).filter(
            (ConsentRecordModel.patient_id == patient_id) | (ConsentRecordModel.consent_id == c_id)
        ).first()
        if rec:
            return {
                "patient_id": rec.patient_id,
                "abha_id": rec.abha_id,
                "consent_given": rec.consent_given,
                "consent_language": rec.consent_language,
                "consent_scope": json.loads(rec.scopes_json) if rec.scopes_json else [],
                "is_minor": rec.is_minor
            }
        return None
    except Exception as e:
        print(f"[DB Get Consent Error] {e}")
        return None
    finally:
        db.close()

