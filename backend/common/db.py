"""
MediKiosk Shared Database Access Layer (PostgreSQL & SQLite Fallback)

Reads connection string from environment variable:
DATABASE_URL=postgresql://user:password@localhost:5432/medikiosk

Provides a shared connection layer and automatic table initialization for:
- sessions
- module_a_history
- module_a_transcript
- module_b_documents
- module_c_summaries
- module_d_consent
"""

import os
import json
import sqlite3
from pathlib import Path
from typing import Dict, Any, List, Optional
from dotenv import load_dotenv

import time

load_dotenv()

# Check for psycopg2
try:
    import psycopg2
    import psycopg2.extras
    PSYCOPG2_AVAILABLE = True
except ImportError:
    PSYCOPG2_AVAILABLE = False


DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/medikiosk")
DB_ENGINE_TYPE = "unknown"
SQLITE_PATH = Path(__file__).resolve().parents[1] / "medikiosk.db"

_PG_FAILED = False
_PG_FAILED_TIME = 0.0


def _get_raw_connection():
    """Initializes and returns raw database connection (PostgreSQL or SQLite fallback)."""
    global DB_ENGINE_TYPE, _PG_FAILED, _PG_FAILED_TIME
    now = time.time()

    if PSYCOPG2_AVAILABLE and not (_PG_FAILED and (now - _PG_FAILED_TIME) < 60):
        try:
            conn = psycopg2.connect(DATABASE_URL, connect_timeout=1)
            conn.autocommit = True
            DB_ENGINE_TYPE = "postgresql"
            _PG_FAILED = False
            return conn
        except Exception:
            _PG_FAILED = True
            _PG_FAILED_TIME = now

    # SQLite Fallback
    DB_ENGINE_TYPE = "sqlite"
    conn = sqlite3.connect(str(SQLITE_PATH), timeout=10)
    conn.row_factory = sqlite3.Row
    return conn


def get_db_connection():
    """Returns an active database connection."""
    return _get_raw_connection()


def _adapt_query(query: str) -> str:
    """Adapts query parameter syntax if using SQLite fallback."""
    if DB_ENGINE_TYPE == "sqlite":
        q = query.replace("SERIAL PRIMARY KEY", "INTEGER PRIMARY KEY AUTOINCREMENT")
        q = q.replace("%s", "?")
        return q
    return query


def execute_db(query: str, params: tuple = ()) -> bool:
    """Executes INSERT / UPDATE / DELETE query."""
    conn = get_db_connection()
    try:
        cur = conn.cursor()
        adapted_query = _adapt_query(query)
        cur.execute(adapted_query, params)
        if DB_ENGINE_TYPE == "sqlite":
            conn.commit()
        cur.close()
        conn.close()
        return True
    except Exception as e:
        print(f"[DB Execute Error] {e} | Query: {query}")
        try:
            conn.rollback()
        except Exception:
            pass
        conn.close()
        return False


def fetch_one_db(query: str, params: tuple = ()) -> Optional[dict]:
    """Fetches a single row as dictionary."""
    conn = get_db_connection()
    try:
        cur = conn.cursor()
        adapted_query = _adapt_query(query)
        cur.execute(adapted_query, params)
        row = cur.fetchone()
        cur.close()
        conn.close()
        if not row:
            return None
        if DB_ENGINE_TYPE == "postgresql":
            colnames = [desc[0] for desc in cur.description]
            return dict(zip(colnames, row))
        else:
            return dict(row)
    except Exception as e:
        print(f"[DB Fetch One Error] {e} | Query: {query}")
        conn.close()
        return None


def fetch_all_db(query: str, params: tuple = ()) -> List[dict]:
    """Fetches all matching rows as list of dictionaries."""
    conn = get_db_connection()
    try:
        cur = conn.cursor()
        adapted_query = _adapt_query(query)
        cur.execute(adapted_query, params)
        rows = cur.fetchall()
        cur.close()
        conn.close()
        if not rows:
            return []
        if DB_ENGINE_TYPE == "postgresql":
            colnames = [desc[0] for desc in cur.description]
            return [dict(zip(colnames, r)) for r in rows]
        else:
            return [dict(r) for r in rows]
    except Exception as e:
        print(f"[DB Fetch All Error] {e} | Query: {query}")
        conn.close()
        return []


def init_db():
    """Initializes tables matching medikiosk_schema.sql."""
    tables = [
        """
        CREATE TABLE IF NOT EXISTS sessions (
            patient_id VARCHAR(100) PRIMARY KEY,
            language VARCHAR(10) DEFAULT 'en',
            mode VARCHAR(20) DEFAULT 'standard',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        """,
        """
        CREATE TABLE IF NOT EXISTS module_a_history (
            patient_id VARCHAR(100) PRIMARY KEY REFERENCES sessions(patient_id) ON DELETE CASCADE,
            chief_complaint TEXT,
            hpi TEXT,
            past_medical_history TEXT,
            past_surgical_history TEXT,
            drug_allergy_history TEXT,
            family_history TEXT,
            personal_history TEXT,
            review_of_systems TEXT,
            ayush TEXT,
            red_flag_detected BOOLEAN DEFAULT FALSE,
            red_flag_reason TEXT,
            last_asked_field VARCHAR(100),
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        """,
        """
        CREATE TABLE IF NOT EXISTS module_a_transcript (
            id SERIAL PRIMARY KEY,
            patient_id VARCHAR(100) REFERENCES sessions(patient_id) ON DELETE CASCADE,
            turn_number INT,
            question TEXT,
            answer TEXT,
            field VARCHAR(100),
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        """,
        """
        CREATE TABLE IF NOT EXISTS module_b_documents (
            document_id VARCHAR(100) PRIMARY KEY,
            patient_id VARCHAR(100) REFERENCES sessions(patient_id) ON DELETE CASCADE,
            document_type VARCHAR(50),
            document_date VARCHAR(20),
            diagnoses TEXT,
            medications TEXT,
            investigations TEXT,
            image_path TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        """,
        """
        CREATE TABLE IF NOT EXISTS module_c_summaries (
            summary_id VARCHAR(100) PRIMARY KEY,
            patient_id VARCHAR(100) REFERENCES sessions(patient_id) ON DELETE CASCADE,
            summary_language VARCHAR(10),
            chief_complaint TEXT,
            hpi TEXT,
            past_medical_surgical TEXT,
            drug_allergy TEXT,
            family_history TEXT,
            personal_history TEXT,
            review_of_systems TEXT,
            prior_investigations_summary TEXT,
            coding TEXT,
            editable BOOLEAN DEFAULT TRUE,
            summary_json TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        """,
        """
        CREATE TABLE IF NOT EXISTS module_d_consent (
            consent_id VARCHAR(100) PRIMARY KEY,
            patient_id VARCHAR(100) REFERENCES sessions(patient_id) ON DELETE CASCADE,
            abha_id VARCHAR(100),
            consent_given BOOLEAN DEFAULT TRUE,
            consent_timestamp TEXT,
            consent_language VARCHAR(10),
            consent_scope TEXT,
            guardian_consent BOOLEAN DEFAULT FALSE,
            session_cleared BOOLEAN DEFAULT FALSE,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        """,
        """
        CREATE TABLE IF NOT EXISTS users (
            user_id VARCHAR(100) PRIMARY KEY,
            username VARCHAR(100) UNIQUE NOT NULL,
            password_hash VARCHAR(255) NOT NULL,
            role VARCHAR(20) NOT NULL,
            full_name VARCHAR(100),
            abha_id VARCHAR(100),
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        """,
        """
        CREATE TABLE IF NOT EXISTS patients (
            id VARCHAR(36) PRIMARY KEY,
            abha_id VARCHAR(100),
            name VARCHAR(200),
            age INT,
            gender VARCHAR(20),
            contact_number VARCHAR(20),
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        """,
        """
        CREATE TABLE IF NOT EXISTS encounters (
            id VARCHAR(36) PRIMARY KEY,
            patient_id VARCHAR(100),
            facility_id VARCHAR(100) DEFAULT 'PHC-RURAL-01',
            clinician_id VARCHAR(100),
            encounter_type VARCHAR(50) DEFAULT 'Kiosk',
            status VARCHAR(50) DEFAULT 'IN_PROGRESS',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        """,
        """
        CREATE TABLE IF NOT EXISTS clinical_intakes (
            id VARCHAR(36) PRIMARY KEY,
            encounter_id VARCHAR(36),
            raw_transcript TEXT,
            structured_json TEXT,
            ai_summary TEXT,
            red_flags_detected BOOLEAN DEFAULT FALSE,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        """,
        """
        CREATE TABLE IF NOT EXISTS documents (
            id VARCHAR(36) PRIMARY KEY,
            patient_id VARCHAR(100),
            file_url TEXT,
            ocr_extracted_text TEXT,
            chronological_timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        """,
        """
        CREATE TABLE IF NOT EXISTS referrals (
            id VARCHAR(36) PRIMARY KEY,
            patient_id VARCHAR(100),
            origin_facility_id VARCHAR(100) DEFAULT 'PHC-RURAL-01',
            destination_facility_id VARCHAR(100) DEFAULT 'DISTRICT-HOSP-01',
            clinical_reason TEXT,
            status VARCHAR(50) DEFAULT 'PENDING',
            discharge_notes TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        """,
        """
        CREATE TABLE IF NOT EXISTS high_risk_registry (
            id VARCHAR(36) PRIMARY KEY,
            patient_id VARCHAR(100),
            condition_tag VARCHAR(100),
            assigned_worker_id VARCHAR(100),
            follow_up_due_date VARCHAR(20),
            status VARCHAR(50) DEFAULT 'PENDING_VISIT',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        """
    ]
    for statement in tables:
        execute_db(statement)


# ============================================================
# HELPER DATA WRITERS & READERS
# ============================================================

def save_sessions_row(patient_id: str, language: str = "en", mode: str = "standard"):
    row = fetch_one_db("SELECT patient_id FROM sessions WHERE patient_id = %s", (patient_id,))
    if not row:
        execute_db("INSERT INTO sessions (patient_id, language, mode) VALUES (%s, %s, %s)", (patient_id, language, mode))
    else:
        execute_db("UPDATE sessions SET language = %s, mode = %s WHERE patient_id = %s", (language, mode, patient_id))


def upsert_module_a_history(patient_id: str, state: dict):
    save_sessions_row(patient_id, state.get("language", "en"), state.get("mode", "standard"))
    ext = state.get("extracted", {})
    params = (
        str(ext.get("chief_complaint", "")),
        json.dumps(ext.get("hpi", {})),
        json.dumps(ext.get("past_medical_history", [])),
        json.dumps(ext.get("past_surgical_history", [])),
        json.dumps(ext.get("drug_allergy_history", [])),
        json.dumps(ext.get("family_history", [])),
        json.dumps(ext.get("personal_history", [])),
        json.dumps(ext.get("review_of_systems", [])),
        json.dumps(ext.get("ayush", {})),
        bool(state.get("red_flag_detected", False)),
        state.get("red_flag_reason"),
        state.get("last_asked_field"),
        patient_id
    )
    row = fetch_one_db("SELECT patient_id FROM module_a_history WHERE patient_id = %s", (patient_id,))
    if row:
        execute_db("""
            UPDATE module_a_history SET
                chief_complaint = %s, hpi = %s, past_medical_history = %s,
                past_surgical_history = %s, drug_allergy_history = %s, family_history = %s,
                personal_history = %s, review_of_systems = %s, ayush = %s,
                red_flag_detected = %s, red_flag_reason = %s, last_asked_field = %s
            WHERE patient_id = %s
        """, params)
    else:
        execute_db("""
            INSERT INTO module_a_history (
                chief_complaint, hpi, past_medical_history, past_surgical_history,
                drug_allergy_history, family_history, personal_history, review_of_systems,
                ayush, red_flag_detected, red_flag_reason, last_asked_field, patient_id
            ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        """, params)


def insert_module_a_transcript(patient_id: str, turn_number: int, question: str, answer: str, field: str):
    save_sessions_row(patient_id)
    execute_db("""
        INSERT INTO module_a_transcript (patient_id, turn_number, question, answer, field)
        VALUES (%s, %s, %s, %s, %s)
    """, (patient_id, turn_number, question, answer, field))


def fetch_module_a_history(patient_id: str) -> Optional[dict]:
    row = fetch_one_db("SELECT * FROM module_a_history WHERE patient_id = %s", (patient_id,))
    if not row:
        return None
    
    def _parse_json(val, default):
        if not val:
            return default
        if isinstance(val, (dict, list)):
            return val
        try:
            return json.loads(val)
        except Exception:
            return default

    # Also fetch transcripts
    transcript_rows = fetch_all_db("SELECT turn_number, question, answer, field FROM module_a_transcript WHERE patient_id = %s ORDER BY turn_number ASC", (patient_id,))
    history_list = [{"question": t["question"], "answer": t["answer"], "field": t["field"]} for t in transcript_rows]

    # Fetch session language & mode
    sess_row = fetch_one_db("SELECT language, mode FROM sessions WHERE patient_id = %s", (patient_id,))
    lang = sess_row.get("language", "en") if sess_row else "en"
    mode = sess_row.get("mode", "standard") if sess_row else "standard"

    extracted = {
        "chief_complaint": row.get("chief_complaint", "") or "",
        "hpi": _parse_json(row.get("hpi"), {}),
        "past_medical_history": _parse_json(row.get("past_medical_history"), []),
        "past_surgical_history": _parse_json(row.get("past_surgical_history"), []),
        "drug_allergy_history": _parse_json(row.get("drug_allergy_history"), []),
        "family_history": _parse_json(row.get("family_history"), []),
        "personal_history": _parse_json(row.get("personal_history"), []),
        "review_of_systems": _parse_json(row.get("review_of_systems"), []),
        "ayush": _parse_json(row.get("ayush"), {})
    }

    return {
        "patient_id": patient_id,
        "language": lang,
        "mode": mode,
        "history": history_list,
        "extracted": extracted,
        "last_asked_field": row.get("last_asked_field"),
        "red_flag_detected": bool(row.get("red_flag_detected", False)),
        "red_flag_reason": row.get("red_flag_reason")
    }


def insert_module_b_document(patient_id: str, doc_data: dict, image_path: str):
    save_sessions_row(patient_id)
    doc_id = doc_data.get("document_id")
    params = (
        doc_id,
        patient_id,
        doc_data.get("document_type", "prescription"),
        doc_data.get("document_date", ""),
        json.dumps(doc_data.get("diagnoses", [])),
        json.dumps(doc_data.get("medications", [])),
        json.dumps(doc_data.get("investigations", [])),
        image_path
    )
    row = fetch_one_db("SELECT document_id FROM module_b_documents WHERE document_id = %s", (doc_id,))
    if not row:
        execute_db("""
            INSERT INTO module_b_documents (
                document_id, patient_id, document_type, document_date,
                diagnoses, medications, investigations, image_path
            ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
        """, params)
    else:
        execute_db("""
            UPDATE module_b_documents SET
                patient_id = %s, document_type = %s, document_date = %s,
                diagnoses = %s, medications = %s, investigations = %s, image_path = %s
            WHERE document_id = %s
        """, (patient_id, doc_data.get("document_type"), doc_data.get("document_date"), json.dumps(doc_data.get("diagnoses")), json.dumps(doc_data.get("medications")), json.dumps(doc_data.get("investigations")), image_path, doc_id))


def fetch_module_b_documents(patient_id: str) -> List[dict]:
    rows = fetch_all_db("SELECT * FROM module_b_documents WHERE patient_id = %s", (patient_id,))
    results = []
    def _parse(v, d):
        if not v:
            return d
        if isinstance(v, (dict, list)):
            return v
        try:
            return json.loads(v)
        except Exception:
            return d

    for r in rows:
        results.append({
            "document_id": r["document_id"],
            "patient_id": r["patient_id"],
            "document_type": r["document_type"],
            "document_date": r["document_date"],
            "diagnoses": _parse(r["diagnoses"], []),
            "medications": _parse(r["medications"], []),
            "investigations": _parse(r["investigations"], []),
            "image_path": r["image_path"]
        })
    return results


def insert_module_c_summary(patient_id: str, summary_data: dict):
    save_sessions_row(patient_id)
    summary_id = summary_data.get("summary_id", f"sum-{patient_id}")
    params = (
        summary_id,
        patient_id,
        summary_data.get("summary_language", "en"),
        summary_data.get("chief_complaint", ""),
        summary_data.get("hpi_summary") or str(summary_data.get("hpi", "")),
        summary_data.get("past_medical_surgical", ""),
        summary_data.get("drug_allergy", ""),
        summary_data.get("family_history", ""),
        summary_data.get("personal_history", ""),
        summary_data.get("review_of_systems", ""),
        summary_data.get("prior_investigations_summary", ""),
        json.dumps(summary_data.get("coding", {})),
        bool(summary_data.get("editable", True)),
        json.dumps(summary_data)
    )
    row = fetch_one_db("SELECT summary_id FROM module_c_summaries WHERE summary_id = %s", (summary_id,))
    if not row:
        execute_db("""
            INSERT INTO module_c_summaries (
                summary_id, patient_id, summary_language, chief_complaint, hpi,
                past_medical_surgical, drug_allergy, family_history, personal_history,
                review_of_systems, prior_investigations_summary, coding, editable, summary_json
            ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        """, params)
    else:
        execute_db("""
            UPDATE module_c_summaries SET
                summary_language = %s, chief_complaint = %s, hpi = %s,
                past_medical_surgical = %s, drug_allergy = %s, family_history = %s,
                personal_history = %s, review_of_systems = %s, prior_investigations_summary = %s,
                coding = %s, editable = %s, summary_json = %s
            WHERE summary_id = %s
        """, (summary_data.get("summary_language", "en"), summary_data.get("chief_complaint", ""), summary_data.get("hpi_summary") or str(summary_data.get("hpi", "")), summary_data.get("past_medical_surgical", ""), summary_data.get("drug_allergy", ""), summary_data.get("family_history", ""), summary_data.get("personal_history", ""), summary_data.get("review_of_systems", ""), summary_data.get("prior_investigations_summary", ""), json.dumps(summary_data.get("coding", {})), bool(summary_data.get("editable", True)), json.dumps(summary_data), summary_id))


def fetch_module_c_summary(patient_id: str) -> Optional[dict]:
    summary_id = f"sum-{patient_id}"
    row = fetch_one_db("SELECT summary_json FROM module_c_summaries WHERE patient_id = %s OR summary_id = %s", (patient_id, summary_id))
    if row and row.get("summary_json"):
        try:
            return json.loads(row["summary_json"])
        except Exception:
            return None
    return None


def insert_module_d_consent(patient_id: str, consent_data: dict):
    save_sessions_row(patient_id)
    consent_id = f"consent-{patient_id}"
    params = (
        consent_id,
        patient_id,
        consent_data.get("abha_id"),
        bool(consent_data.get("consent_given", True)),
        str(consent_data.get("consent_timestamp", "")),
        consent_data.get("consent_language", "en"),
        json.dumps(consent_data.get("consent_scope", [])),
        bool(consent_data.get("guardian_consent", False)),
        bool(consent_data.get("session_cleared", True))
    )
    row = fetch_one_db("SELECT consent_id FROM module_d_consent WHERE consent_id = %s", (consent_id,))
    if not row:
        execute_db("""
            INSERT INTO module_d_consent (
                consent_id, patient_id, abha_id, consent_given, consent_timestamp,
                consent_language, consent_scope, guardian_consent, session_cleared
            ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
        """, params)
    else:
        execute_db("""
            UPDATE module_d_consent SET
                abha_id = %s, consent_given = %s, consent_timestamp = %s,
                consent_language = %s, consent_scope = %s, guardian_consent = %s, session_cleared = %s
            WHERE consent_id = %s
        """, (consent_data.get("abha_id"), bool(consent_data.get("consent_given", True)), str(consent_data.get("consent_timestamp", "")), consent_data.get("consent_language", "en"), json.dumps(consent_data.get("consent_scope", [])), bool(consent_data.get("guardian_consent", False)), bool(consent_data.get("session_cleared", True)), consent_id))


def fetch_module_d_consent(patient_id: str) -> Optional[dict]:
    consent_id = f"consent-{patient_id}"
    row = fetch_one_db("SELECT * FROM module_d_consent WHERE patient_id = %s OR consent_id = %s", (patient_id, consent_id))
    if not row:
        return None
    def _parse(v, d):
        if not v:
            return d
        if isinstance(v, (dict, list)):
            return v
        try:
            return json.loads(v)
        except Exception:
            return d

    return {
        "patient_id": row["patient_id"],
        "abha_id": row["abha_id"],
        "consent_given": bool(row["consent_given"]),
        "consent_timestamp": row["consent_timestamp"],
        "consent_language": row["consent_language"],
        "consent_scope": _parse(row["consent_scope"], []),
        "guardian_consent": bool(row["guardian_consent"]),
        "session_cleared": bool(row["session_cleared"])
    }


def create_user_in_db(user_id: str, username: str, password_hash: str, role: str, full_name: str = "", abha_id: str = "") -> bool:
    """Inserts a new user record into DB."""
    return execute_db("""
        INSERT INTO users (user_id, username, password_hash, role, full_name, abha_id)
        VALUES (%s, %s, %s, %s, %s, %s)
    """, (user_id, username, password_hash, role, full_name, abha_id))


def fetch_user_by_username(username: str) -> Optional[dict]:
    """Fetches user account by username."""
    row = fetch_one_db("SELECT * FROM users WHERE username = %s", (username,))
    if not row:
        return None
    return dict(row)


def fetch_user_by_id(user_id: str) -> Optional[dict]:
    """Fetches user account by user_id."""
    row = fetch_one_db("SELECT * FROM users WHERE user_id = %s", (user_id,))
    if not row:
        return None
    return dict(row)


def fetch_all_patient_sessions() -> List[dict]:
    """Fetches all active patient sessions with full patient details for physician dashboard queue."""
    rows = fetch_all_db("""
        SELECT 
            s.patient_id, 
            s.language, 
            s.mode, 
            s.created_at,
            p.name as patient_name,
            p.age,
            p.gender,
            p.contact_number,
            p.abha_id,
            u.full_name as user_full_name,
            h.chief_complaint,
            h.red_flag_detected,
            h.red_flag_reason,
            (SELECT COUNT(*) FROM module_b_documents b WHERE b.patient_id = s.patient_id) as doc_count,
            (SELECT COUNT(*) FROM module_c_summaries c WHERE c.patient_id = s.patient_id) as summary_count
        FROM sessions s
        LEFT JOIN patients p ON s.patient_id = p.id
        LEFT JOIN users u ON s.patient_id = u.user_id
        LEFT JOIN module_a_history h ON s.patient_id = h.patient_id
        ORDER BY s.created_at DESC
    """)
    results = []
    for r in rows:
        name = r.get("patient_name") or r.get("user_full_name") or r["patient_id"]
        results.append({
            "patient_id": r["patient_id"],
            "full_name": name,
            "name": name,
            "age": r.get("age") or 30,
            "gender": r.get("gender") or "unspecified",
            "contact_number": r.get("contact_number"),
            "abha_id": r.get("abha_id"),
            "language": r.get("language", "en"),
            "mode": r.get("mode", "standard"),
            "created_at": str(r.get("created_at", "")),
            "chief_complaint": r.get("chief_complaint") or "No intake recorded yet",
            "red_flag_detected": bool(r.get("red_flag_detected", False)),
            "red_flag_reason": r.get("red_flag_reason"),
            "doc_count": int(r.get("doc_count") or 0),
            "has_summary": int(r.get("summary_count") or 0) > 0
        })
    return results


# Run initialization on import
init_db()
