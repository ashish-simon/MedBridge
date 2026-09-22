"""
Shared session utilities.

Every module (A, B, C, D) references the same patient_id for a given kiosk
session. Until Module D builds the real ABHA-verified ID flow, this stand-in
generator is what everyone uses — so Module A/B/C can be built and tested
today without waiting for Module D to exist.

When Module D is built later, it will call `start_session()` internally as
part of the real ABHA-verification flow (or generate its own ID that follows
the same shape) — nothing in A/B/C needs to change when that happens, because
they only ever depend on "a patient_id string being present," not on how it
was created.
"""

import uuid
from datetime import datetime, timezone
from typing import Optional
from common.db import execute_db, fetch_one_db


def generate_patient_id() -> str:
    """
    Stand-in patient ID generator.
    Real version (Module D) will replace this with the patient's verified
    ABHA ID once that flow is built — every other module just needs *a*
    consistent string, not this specific format.
    """
    return f"temp-{uuid.uuid4().hex[:12]}"


def start_session(abha_id: Optional[str] = None, language: str = "en", mode: str = "standard") -> dict:
    """
    Called once when a patient begins at the kiosk (Step 1 — Identify).
    Inserts a row into the `sessions` table (patient_id, language, mode, created_at) immediately.
    This is what every other table's foreign key depends on existing first.
    """
    pid = abha_id if abha_id else generate_patient_id()
    now_iso = datetime.now(timezone.utc).isoformat()

    # Check if session already exists
    existing = fetch_one_db("SELECT patient_id FROM sessions WHERE patient_id = %s", (pid,))
    if not existing:
        execute_db(
            "INSERT INTO sessions (patient_id, language, mode, created_at) VALUES (%s, %s, %s, %s)",
            (pid, language, mode, now_iso)
        )
    else:
        execute_db(
            "UPDATE sessions SET language = %s, mode = %s WHERE patient_id = %s",
            (language, mode, pid)
        )

    return {
        "patient_id": pid,
        "session_started_at": now_iso,
    }

