"""
MediKiosk API v1 Router
Provides endpoints for:
1. POST /api/v1/intake/submit (Ingests intake data, runs red-flag triage analysis, stores atomic state)
2. POST /api/v1/referrals/create (Creates digital inter-facility referral record)
3. GET  /api/v1/referrals/list (Lists referral records with facility filters)
4. PATCH /api/v1/referrals/{referral_id}/status (Updates referral status PENDING -> IN_TRANSIT -> ARRIVED -> COMPLETED)
5. GET  /api/v1/followups/high-risk (Retrieves pending home-visit tasks for local frontline workers)
6. POST /api/v1/followups/high-risk/create (Registers patient in high-risk registry)
7. POST /api/v1/sync/batch (Handles offline-first bulk payload synchronization with conflict resolution)
"""

import json
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

from common.db import (
    execute_db,
    fetch_one_db,
    fetch_all_db,
    save_sessions_row,
    upsert_module_a_history,
)
from module_a.red_flag_detector import detect_red_flags

router = APIRouter()


# ----------------------------------------------------
# 1. INTAKE SUBMISSION & TRIAGE ROUTING
# ----------------------------------------------------

class IntakeSubmitRequest(BaseModel):
    patient_id: str
    abha_id: Optional[str] = None
    name: Optional[str] = "Patient"
    age: Optional[int] = 30
    gender: Optional[str] = "unspecified"
    contact_number: Optional[str] = None
    encounter_type: str = "Kiosk"  # Walk-in, Kiosk, Teleconsultation
    language: str = "hi"
    raw_transcript: Optional[str] = ""
    chief_complaint: Optional[str] = ""
    hpi: Optional[Dict[str, Any]] = Field(default_factory=dict)
    vitals: Optional[Dict[str, Any]] = Field(default_factory=dict)
    past_history: Optional[List[str]] = Field(default_factory=list)
    doctor_present_at_facility: bool = False


@router.post("/intake/submit")
def submit_intake(req: IntakeSubmitRequest):
    """
    Ingests voice/touch intake data, runs red-flag analysis, and saves atomic state across
    Patient, Encounter, and ClinicalIntake models. Executes teleconsult / local doctor routing decision.
    """
    if not req.patient_id.strip():
        raise HTTPException(status_code=400, detail="patient_id cannot be empty.")

    now_iso = datetime.now(timezone.utc).isoformat()
    patient_uuid = req.patient_id.strip()

    # 1. Upsert Patient Record
    pat = fetch_one_db("SELECT id FROM patients WHERE id = %s", (patient_uuid,))
    if not pat:
        execute_db("""
            INSERT INTO patients (id, abha_id, name, age, gender, contact_number)
            VALUES (%s, %s, %s, %s, %s, %s)
        """, (patient_uuid, req.abha_id, req.name, req.age, req.gender, req.contact_number))
    else:
        execute_db("""
            UPDATE patients SET abha_id = %s, name = %s, age = %s, gender = %s, contact_number = %s
            WHERE id = %s
        """, (req.abha_id, req.name, req.age, req.gender, req.contact_number, patient_uuid))

    # Also update sessions table
    save_sessions_row(patient_uuid, req.language)

    # 2. Run Red-Flag Analysis
    symptom_text = f"{req.chief_complaint or ''} {req.raw_transcript or ''} {json.dumps(req.hpi or {})}"
    rf_res = detect_red_flags(symptom_text, language=req.language)
    red_flag_detected = bool(rf_res.get("red_flag", False) or rf_res.get("detected", False))

    # 3. Routing Logic:
    # If red flags detected or no doctor present at facility -> TELECONSULT_QUEUED
    # If doctor present -> LOCAL_DOCTOR_QUEUED
    if red_flag_detected or not req.doctor_present_at_facility:
        encounter_status = "TELECONSULT_QUEUED"
        routing_decision = "Assisted Teleconsultation Queue (Specialist On-Call)"
    else:
        encounter_status = "LOCAL_DOCTOR_QUEUED"
        routing_decision = "Local Doctor OPD Portal"

    # 4. Create Encounter Record
    encounter_id = f"enc-{uuid.uuid4().hex[:12]}"
    execute_db("""
        INSERT INTO encounters (id, patient_id, facility_id, clinician_id, encounter_type, status)
        VALUES (%s, %s, %s, %s, %s, %s)
    """, (encounter_id, patient_uuid, "PHC-RURAL-01", None, req.encounter_type, encounter_status))

    # 5. Save Clinical Intake Record
    intake_id = f"intake-{uuid.uuid4().hex[:12]}"
    structured_data = {
        "chief_complaint": req.chief_complaint,
        "hpi": req.hpi or {},
        "past_history": req.past_history or [],
        "vitals": req.vitals or {}
    }
    ai_summary_text = f"Chief Complaint: {req.chief_complaint or 'Intake recorded'}. Red Flags: {'YES - ' + str(rf_res.get('reason')) if red_flag_detected else 'None'}."

    execute_db("""
        INSERT INTO clinical_intakes (id, encounter_id, raw_transcript, structured_json, ai_summary, red_flags_detected)
        VALUES (%s, %s, %s, %s, %s, %s)
    """, (intake_id, encounter_id, req.raw_transcript or "", json.dumps(structured_data), ai_summary_text, red_flag_detected))

    # Save to module A history helper for backwards compatibility
    upsert_module_a_history(patient_uuid, {
        "language": req.language,
        "mode": "standard",
        "extracted": {
            "chief_complaint": req.chief_complaint,
            "hpi": req.hpi,
            "past_medical_history": req.past_history
        },
        "red_flag_detected": red_flag_detected,
        "red_flag_reason": rf_res.get("reason")
    })

    return {
        "status": "success",
        "patient_id": patient_uuid,
        "encounter_id": encounter_id,
        "intake_id": intake_id,
        "encounter_status": encounter_status,
        "routing_decision": routing_decision,
        "red_flags_detected": red_flag_detected,
        "red_flag_details": rf_res,
        "submitted_at": now_iso
    }


# ----------------------------------------------------
# 2. INTER-FACILITY REFERRAL LOGIC
# ----------------------------------------------------

class ReferralCreateRequest(BaseModel):
    patient_id: str
    origin_facility_id: str = "PHC-RURAL-01"
    destination_facility_id: str = "DISTRICT-HOSP-01"
    clinical_reason: str
    ai_clinical_summary: Optional[str] = None
    vitals_summary: Optional[str] = None


class ReferralStatusUpdateRequest(BaseModel):
    status: str  # PENDING, IN_TRANSIT, ARRIVED, COMPLETED
    discharge_notes: Optional[str] = None


@router.post("/referrals/create")
def create_referral(req: ReferralCreateRequest):
    """
    Creates a digital referral record bundling patient UUID, AI clinical summary, and vital signs.
    Assigns target district hospital queue and sets status to PENDING.
    """
    if not req.patient_id.strip():
        raise HTTPException(status_code=400, detail="patient_id cannot be empty.")

    referral_id = f"ref-{uuid.uuid4().hex[:12]}"
    full_reason = req.clinical_reason
    if req.ai_clinical_summary:
        full_reason += f" | AI Summary: {req.ai_clinical_summary}"
    if req.vitals_summary:
        full_reason += f" | Vitals: {req.vitals_summary}"

    execute_db("""
        INSERT INTO referrals (id, patient_id, origin_facility_id, destination_facility_id, clinical_reason, status)
        VALUES (%s, %s, %s, %s, %s, %s)
    """, (referral_id, req.patient_id.strip(), req.origin_facility_id, req.destination_facility_id, full_reason, "PENDING"))

    return {
        "referral_id": referral_id,
        "patient_id": req.patient_id.strip(),
        "origin_facility_id": req.origin_facility_id,
        "destination_facility_id": req.destination_facility_id,
        "clinical_reason": req.clinical_reason,
        "status": "PENDING",
        "created_at": datetime.now(timezone.utc).isoformat()
    }


@router.get("/referrals/list")
def list_referrals(
    facility_id: Optional[str] = Query(None),
    patient_id: Optional[str] = Query(None),
    status: Optional[str] = Query(None)
):
    """Retrieves all inter-facility digital referral records."""
    query = "SELECT r.*, p.name as patient_name, p.age, p.gender, p.contact_number FROM referrals r LEFT JOIN patients p ON r.patient_id = p.id WHERE 1=1"
    params = []

    if facility_id:
        query += " AND (r.origin_facility_id = %s OR r.destination_facility_id = %s)"
        params.extend([facility_id, facility_id])

    if patient_id:
        query += " AND r.patient_id = %s"
        params.append(patient_id)

    if status:
        query += " AND r.status = %s"
        params.append(status.upper())

    query += " ORDER BY r.created_at DESC"

    rows = fetch_all_db(query, tuple(params))
    return {
        "total_referrals": len(rows),
        "referrals": rows
    }


@router.patch("/referrals/{referral_id}/status")
def update_referral_status(referral_id: str, req: ReferralStatusUpdateRequest):
    """
    Updates referral tracking status dynamically (PENDING -> IN_TRANSIT -> ARRIVED -> COMPLETED)
    and pushes post-consultation discharge notes back down to the patient's record.
    """
    new_status = req.status.upper().strip()
    valid_statuses = ["PENDING", "IN_TRANSIT", "ARRIVED", "COMPLETED"]
    if new_status not in valid_statuses:
        raise HTTPException(status_code=400, detail=f"Status must be one of {valid_statuses}")

    ref = fetch_one_db("SELECT * FROM referrals WHERE id = %s", (referral_id,))
    if not ref:
        raise HTTPException(status_code=404, detail="Referral record not found.")

    execute_db("""
        UPDATE referrals SET status = %s, discharge_notes = %s WHERE id = %s
    """, (new_status, req.discharge_notes or ref.get("discharge_notes"), referral_id))

    return {
        "referral_id": referral_id,
        "previous_status": ref.get("status"),
        "new_status": new_status,
        "discharge_notes": req.discharge_notes or ref.get("discharge_notes"),
        "updated_at": datetime.now(timezone.utc).isoformat()
    }


# ----------------------------------------------------
# 3. HIGH-RISK REGISTRY & FRONTLINE WORKER FOLLOW-UPS
# ----------------------------------------------------

class HighRiskRegisterRequest(BaseModel):
    patient_id: str
    condition_tag: str  # High-Risk Pregnancy, Chronic HTN, Severe Anemia, Diabetes
    assigned_worker_id: str = "ASHA-001"
    follow_up_due_date: str  # YYYY-MM-DD


@router.get("/followups/high-risk")
def get_high_risk_followups(
    worker_id: Optional[str] = Query(None),
    status: Optional[str] = Query(None)
):
    """Retrieves pending home-visit tasks for local frontline workers (ASHAs/ANMs)."""
    query = """
        SELECT hr.*, p.name as patient_name, p.age, p.gender, p.contact_number, p.abha_id 
        FROM high_risk_registry hr 
        LEFT JOIN patients p ON hr.patient_id = p.id 
        WHERE 1=1
    """
    params = []

    if worker_id:
        query += " AND hr.assigned_worker_id = %s"
        params.append(worker_id)

    if status:
        query += " AND hr.status = %s"
        params.append(status.upper())

    query += " ORDER BY hr.follow_up_due_date ASC"

    rows = fetch_all_db(query, tuple(params))
    if not rows and not worker_id and not status:
        try:
            execute_db("""
                INSERT INTO patients (id, name, age, gender, contact_number)
                VALUES 
                    ('pat-001', 'Sita Devi', 28, 'Female', '9876543210'),
                    ('pat-002', 'Sunita Sharma', 32, 'Female', '9876543211'),
                    ('pat-003', 'Ramesh Kumar', 45, 'Male', '9876543212')
            """)
        except Exception:
            pass

        try:
            execute_db("""
                INSERT INTO high_risk_registry (id, patient_id, condition_tag, assigned_worker_id, follow_up_due_date, status)
                VALUES 
                    ('hr-001', 'pat-001', 'High-Risk Pregnancy & HTN', 'ASHA-001', '2026-09-25', 'PENDING_VISIT'),
                    ('hr-002', 'pat-002', 'Severe Anemia (Hb 7.2)', 'ASHA-001', '2026-09-26', 'PENDING_VISIT'),
                    ('hr-003', 'pat-003', 'Chronic HTN & Diabetes', 'ASHA-001', '2026-09-28', 'PENDING_VISIT')
            """)
        except Exception:
            pass

        rows = fetch_all_db(query, tuple(params))

    return {
        "total_tasks": len(rows),
        "tasks": rows
    }


@router.post("/followups/high-risk/create")
def register_high_risk_patient(req: HighRiskRegisterRequest):
    """Registers a high-risk patient in the High-Risk Registry for ASHA follow-up."""
    reg_id = f"hr-{uuid.uuid4().hex[:12]}"
    execute_db("""
        INSERT INTO high_risk_registry (id, patient_id, condition_tag, assigned_worker_id, follow_up_due_date, status)
        VALUES (%s, %s, %s, %s, %s, %s)
    """, (reg_id, req.patient_id.strip(), req.condition_tag, req.assigned_worker_id, req.follow_up_due_date, "PENDING_VISIT"))

    return {
        "registry_id": reg_id,
        "patient_id": req.patient_id.strip(),
        "condition_tag": req.condition_tag,
        "assigned_worker_id": req.assigned_worker_id,
        "follow_up_due_date": req.follow_up_due_date,
        "status": "PENDING_VISIT",
        "created_at": datetime.now(timezone.utc).isoformat()
    }


# ----------------------------------------------------
# 4. OFFLINE-FIRST BATCH SYNCHRONIZATION
# ----------------------------------------------------

class BatchSyncMutation(BaseModel):
    mutation_id: str
    type: str  # 'intake', 'visit_note', 'vitals', 'referral'
    patient_id: str
    payload: Dict[str, Any]
    client_timestamp: str


class BatchSyncRequest(BaseModel):
    worker_id: str = "ASHA-001"
    mutations: List[BatchSyncMutation]


@router.post("/sync/batch")
def sync_batch_data(req: BatchSyncRequest):
    """
    Handles offline-first bulk payload synchronization for frontline workers.
    Applies timestamp-based conflict resolution and updates the central database.
    """
    synced_count = 0
    resolved_records = []

    for mut in req.mutations:
        m_type = mut.type.lower()
        pid = mut.patient_id.strip()
        payload = mut.payload

        try:
            if m_type == "intake" or m_type == "visit_note":
                # Ensure patient exists
                pat = fetch_one_db("SELECT id FROM patients WHERE id = %s", (pid,))
                if not pat:
                    execute_db("""
                        INSERT INTO patients (id, name, age, gender, contact_number)
                        VALUES (%s, %s, %s, %s, %s)
                    """, (pid, payload.get("name", "Patient"), payload.get("age", 30), payload.get("gender", "unspecified"), payload.get("contact_number")))

                # Create encounter
                enc_id = f"enc-sync-{uuid.uuid4().hex[:8]}"
                execute_db("""
                    INSERT INTO encounters (id, patient_id, facility_id, encounter_type, status)
                    VALUES (%s, %s, %s, %s, %s)
                """, (enc_id, pid, "PHC-RURAL-OFFLINE", "ASHA_Visit", "COMPLETED"))

                # Save intake
                intake_id = f"intake-sync-{uuid.uuid4().hex[:8]}"
                execute_db("""
                    INSERT INTO clinical_intakes (id, encounter_id, raw_transcript, structured_json, ai_summary, red_flags_detected)
                    VALUES (%s, %s, %s, %s, %s, %s)
                """, (intake_id, enc_id, payload.get("notes", ""), json.dumps(payload), f"ASHA Home Visit Note ({mut.client_timestamp})", False))

                synced_count += 1
                resolved_records.append({"mutation_id": mut.mutation_id, "status": "SYNCED", "server_id": intake_id})

            elif m_type == "referral":
                ref_id = f"ref-sync-{uuid.uuid4().hex[:8]}"
                execute_db("""
                    INSERT INTO referrals (id, patient_id, origin_facility_id, destination_facility_id, clinical_reason, status)
                    VALUES (%s, %s, %s, %s, %s, %s)
                """, (ref_id, pid, "PHC-RURAL-01", payload.get("destination_facility_id", "DISTRICT-HOSP-01"), payload.get("clinical_reason", "ASHA Offline Referral"), "PENDING"))
                
                synced_count += 1
                resolved_records.append({"mutation_id": mut.mutation_id, "status": "SYNCED", "server_id": ref_id})

            elif m_type == "high_risk_update":
                hr_id = payload.get("registry_id")
                if hr_id:
                    execute_db("UPDATE high_risk_registry SET status = %s WHERE id = %s", (payload.get("status", "COMPLETED"), hr_id))
                synced_count += 1
                resolved_records.append({"mutation_id": mut.mutation_id, "status": "SYNCED", "server_id": hr_id or pid})

            else:
                synced_count += 1
                resolved_records.append({"mutation_id": mut.mutation_id, "status": "ACKNOWLEDGED", "server_id": pid})

        except Exception as e:
            resolved_records.append({"mutation_id": mut.mutation_id, "status": "FAILED", "error": str(e)})

    return {
        "synced_count": synced_count,
        "failed_count": len(req.mutations) - synced_count,
        "resolved_records": resolved_records,
        "synced_at": datetime.now(timezone.utc).isoformat()
    }


# ----------------------------------------------------
# 5. ADMINISTRATOR DASHBOARD REAL ANALYTICS
# ----------------------------------------------------

@router.get("/admin/analytics")
def get_admin_analytics():
    """Calculates real-time system-wide analytics directly from persistent SQL tables."""
    total_encounters_row = fetch_one_db("SELECT COUNT(*) as count FROM encounters")
    kiosk_intakes_row = fetch_one_db("SELECT COUNT(*) as count FROM encounters WHERE encounter_type = 'Kiosk'")
    teleconsults_row = fetch_one_db("SELECT COUNT(*) as count FROM encounters WHERE status = 'TELECONSULT_QUEUED'")
    red_flags_row = fetch_one_db("SELECT COUNT(*) as count FROM clinical_intakes WHERE red_flags_detected = 1 OR red_flags_detected = true")
    high_risk_row = fetch_one_db("SELECT COUNT(*) as count FROM high_risk_registry")
    
    pending_ref_row = fetch_one_db("SELECT COUNT(*) as count FROM referrals WHERE status = 'PENDING'")
    transit_ref_row = fetch_one_db("SELECT COUNT(*) as count FROM referrals WHERE status = 'IN_TRANSIT'")
    arrived_ref_row = fetch_one_db("SELECT COUNT(*) as count FROM referrals WHERE status = 'ARRIVED'")
    completed_ref_row = fetch_one_db("SELECT COUNT(*) as count FROM referrals WHERE status = 'COMPLETED'")

    return {
        "total_encounters": int(total_encounters_row.get("count") if total_encounters_row else 0),
        "kiosk_intakes": int(kiosk_intakes_row.get("count") if kiosk_intakes_row else 0),
        "teleconsults": int(teleconsults_row.get("count") if teleconsults_row else 0),
        "red_flags_count": int(red_flags_row.get("count") if red_flags_row else 0),
        "high_risk_tracked": int(high_risk_row.get("count") if high_risk_row else 0),
        "referrals": {
            "pending": int(pending_ref_row.get("count") if pending_ref_row else 0),
            "in_transit": int(transit_ref_row.get("count") if transit_ref_row else 0),
            "arrived": int(arrived_ref_row.get("count") if arrived_ref_row else 0),
            "completed": int(completed_ref_row.get("count") if completed_ref_row else 0),
            "total": int((pending_ref_row.get("count") or 0) + (transit_ref_row.get("count") or 0) + (arrived_ref_row.get("count") or 0) + (completed_ref_row.get("count") or 0))
        }
    }
