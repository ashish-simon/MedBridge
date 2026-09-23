"""
End-to-End Real Data Correlation & Flow Verification Script
Tests real data movement across Patient Kiosk, Physician Portal, and ASHA Dashboard with ZERO mock fallbacks.
"""
import sys
from pathlib import Path

backend_dir = Path(__file__).resolve().parent
sys.path.insert(0, str(backend_dir))

from reset_database import reset_all_tables
from common.auth import register_user, login_user, RegisterRequest, LoginRequest, get_all_patients_queue
from v1.router import submit_intake, IntakeSubmitRequest, create_referral, ReferralCreateRequest, register_high_risk_patient, HighRiskRegisterRequest, get_high_risk_followups
from module_c.router import get_summary_by_patient_id

def test_full_real_data_workflow():
    print("==================================================")
    print("STARTING REAL DATA CORRELATION INTEGRATION TEST")
    print("==================================================\n")

    # 1. Clean Database Reset
    reset_all_tables()

    # 2. Patient Registration (PAT-900001)
    print("1. Registering Patient Account (PAT-900001)...")
    pat_reg = register_user(RegisterRequest(
        username="PAT-900001",
        password="Password123!",
        role="patient",
        full_name="Rajesh Sharma",
        abha_id="91-4820-9182-3490"
    ))
    patient_id = pat_reg["patient_id"]
    print(f"   Patient Registered: ID = {patient_id}, Name = {pat_reg['full_name']}")
    assert patient_id == "PAT-900001", f"Expected PAT-900001, got {patient_id}"

    # 3. Submit Patient AI Intake & Triage
    print("\n2. Submitting Patient Conversational AI Intake & Triage...")
    intake_res = submit_intake(IntakeSubmitRequest(
        patient_id=patient_id,
        abha_id="91-4820-9182-3490",
        name="Rajesh Sharma",
        age=52,
        gender="Male",
        contact_number="9876543210",
        encounter_type="Kiosk",
        language="hi",
        raw_transcript="PATIENT: Severe chest pain and breathlessness for 2 hours.",
        chief_complaint="Severe chest pain & shortness of breath",
        hpi={"onset": "2 hours ago", "character": "Crushing chest pain", "severity": "9/10"},
        vitals={"bp": "160/100", "pulse": 110},
        past_history=["Hypertension"],
        doctor_present_at_facility=False
    ))
    print(f"   Intake Submitted: Status = {intake_res['status']}")
    print(f"   Routing Decision = {intake_res['routing_decision']}")
    print(f"   Red Flags Detected = {intake_res['red_flags_detected']}")
    assert intake_res["red_flags_detected"] is True, "Red flag should be detected for severe chest pain"
    assert intake_res["encounter_status"] == "TELECONSULT_QUEUED", "Encounter status should be TELECONSULT_QUEUED"

    # 4. Doctor Login & Fetch OPD Queue
    print("\n3. Doctor Login & Fetching Live Patient Queue...")
    doc_reg = register_user(RegisterRequest(
        username="DOC-100001",
        password="Password123!",
        role="doctor",
        full_name="Dr. Ananya Rao"
    ))
    print(f"   Doctor Registered: ID = {doc_reg['user_id']}")

    queue_res = get_all_patients_queue()
    print(f"   Patient Queue Count = {queue_res['patient_count']}")
    assert queue_res["patient_count"] == 1, f"Expected 1 patient in queue, got {queue_res['patient_count']}"
    queue_patient = queue_res["patients"][0]
    print(f"   Queue Item: ID = {queue_patient['patient_id']}, Name = {queue_patient['full_name']}, Complaint = {queue_patient['chief_complaint']}")
    assert queue_patient["patient_id"] == patient_id
    assert queue_patient["red_flag_detected"] is True

    # 5. Doctor Fetches Clinical Summary
    print("\n4. Doctor Synthesizes Clinical Summary for PAT-900001...")
    summary = get_summary_by_patient_id(patient_id)
    print(f"   Chief Complaint: {summary['chief_complaint']}")
    print(f"   SNOMED Code: {summary['snomed_ct_code']}")
    assert "chest pain" in summary["chief_complaint"].lower() or "chest" in summary["chief_complaint"].lower()

    # 6. Doctor Issues Referral Slip
    print("\n5. Doctor Generates Digital Referral Slip for Tertiary Hospital...")
    ref_res = create_referral(ReferralCreateRequest(
        patient_id=patient_id,
        origin_facility_id="PHC-RURAL-01",
        destination_facility_id="DISTRICT-CARDIOLOGY-HOSP",
        clinical_reason="Suspected Acute Coronary Syndrome requiring emergency cath lab",
        ai_clinical_summary=summary["chief_complaint"],
        vitals_summary="BP 160/100, Pulse 110"
    ))
    print(f"   Referral Issued: Token = {ref_res['referral_id']}, Status = {ref_res['status']}")
    assert ref_res["patient_id"] == patient_id

    # 7. Doctor Assigns ASHA High-Risk Home Visit Task
    print("\n6. Doctor Registers Patient in High-Risk Registry for ASHA Follow-up...")
    hr_res = register_high_risk_patient(HighRiskRegisterRequest(
        patient_id=patient_id,
        condition_tag="Post-ACS Cardiac Rehabilitation & HTN",
        assigned_worker_id="ASHA-001",
        follow_up_due_date="2026-09-25"
    ))
    print(f"   High-Risk Registry Created: ID = {hr_res['registry_id']}")

    # 8. ASHA Fetches Pending Home Visit Tasks
    print("\n7. ASHA Worker Fetches Home-Visit Tasks...")
    asha_tasks = get_high_risk_followups(worker_id="ASHA-001")
    print(f"   ASHA Task Count = {asha_tasks['total_tasks']}")
    assert asha_tasks["total_tasks"] == 1
    task = asha_tasks["tasks"][0]
    print(f"   Assigned Task: Patient = {task['patient_name']} ({task['patient_id']}), Tag = {task['condition_tag']}")
    assert task["patient_id"] == patient_id

    print("\n==================================================")
    print("ALL REAL DATA CORRELATION TESTS PASSED 100%!")
    print("==================================================")

if __name__ == "__main__":
    test_full_real_data_workflow()
