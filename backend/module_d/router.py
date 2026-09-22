"""
Module D — Consent, Privacy & ABDM Integration Router.

Wires all Module D endpoints into FastAPI under /api/module-d:
- /config/status         : Inspect required .env variables
- /abha/generate-otp     : Milestone M1 ABHA OTP generation
- /abha/verify-otp       : Milestone M1 ABHA OTP confirmation & patient ID replacement
- /consent/terms         : Plain-language consent terms in 22 languages
- /consent/audio         : Spoken audio terms using AI4Bharat / Bhashini TTS (Full Text)
- /consent/guardian      : Guardian consent verification for minors
- /consent/submit        : Final consent submission, file deletion & schema output
- /fhir/generate         : Converts Module A/B/C JSON into NRCeS FHIR R4 Bundle
- /fhir/validate         : Validates Bundle against HAPI FHIR server ($validate)
- /crypto/keypair        : Generates Fidelius ECDH KeyMaterial
- /crypto/encrypt        : Encrypts data using Fidelius protocol
- /crypto/decrypt        : Decrypts data using Fidelius protocol
- /hip/link-context      : Milestone M2 HIP Care context linking
- /hip/push-data         : Milestone M2 Encrypted data push to HIU
- /consent-manager/artifact: Milestone M3 Signed ABDM consent artifact generator
- /hospital/receive      : Stand-in hospital receiving endpoint (e-Hospital / A-HMIS)
- /hospital/received-records: Inspect bundles received by stand-in hospital
- /consent-screen        : Interactive HTML Kiosk Consent UI
"""

import os
from datetime import datetime, timezone
from typing import Dict, Any, List, Optional
from pydantic import BaseModel, Field

from fastapi import APIRouter, HTTPException, Query, status
from fastapi.responses import HTMLResponse, JSONResponse

from module_d.config import ABDMConfig, FHIRConfig, MissingCredentialError, get_all_config_status
from module_d.crypto.fidelius import KeyMaterial, CryptoController, EncryptionRequest, DecryptionRequest
from module_d.abdm.abha_verify import ABHAVerifier, get_verified_abha_for_session
from module_d.abdm.consent_manager import ConsentManagerService
from module_d.abdm.hip_linking import HIPLinkingService
from module_d.fhir.builder import FHIRResourceBuilder
from module_d.fhir.validator import FHIRBundleValidator
from module_d.consent.plain_text import get_consent_text
from module_d.consent.audio import ConsentAudioService
from module_d.consent.guardian import GuardianConsentVerifier
from module_d.consent.session_cleaner import SessionStorageManager
from module_d.hospital.receiving_endpoint import HospitalReceivingRouter

router = APIRouter()


# ----------------------------------------------------
# Request / Response Schemas
# ----------------------------------------------------
class AbhaOtpRequest(BaseModel):
    patient_id: str
    abha_identifier: str
    auth_mode: str = "MOBILE_OTP"


class AbhaVerifyRequest(BaseModel):
    patient_id: str
    transaction_id: str
    otp: str
    abha_identifier: Optional[str] = None


class GuardianConsentRequest(BaseModel):
    patient_id: str
    is_minor: bool
    guardian_name: Optional[str] = None
    guardian_relationship: Optional[str] = None
    guardian_phone: Optional[str] = None
    guardian_confirmed: bool = False


class ConsentSubmitRequest(BaseModel):
    patient_id: str
    abha_id: Optional[str] = None
    consent_given: bool = True
    consent_language: str = "en"
    consent_scope: List[str] = Field(default=["history_capture", "document_sharing", "hospital_hie_link"])
    guardian_consent: bool = False
    is_minor: bool = False
    guardian_details: Optional[Dict[str, Any]] = None


class EncryptDataRequest(BaseModel):
    sender_nonce: str
    requester_nonce: str
    sender_private_key: str
    requester_public_key: str
    string_to_encrypt: str


class DecryptDataRequest(BaseModel):
    sender_nonce: str
    requester_nonce: str
    requester_private_key: str
    sender_public_key: str
    encrypted_data: str


class FHIRGenerateRequest(BaseModel):
    patient_id: str
    abha_id: Optional[str] = None
    module_a_data: Optional[Dict[str, Any]] = None
    module_b_data: Optional[Dict[str, Any]] = None
    module_c_data: Optional[Dict[str, Any]] = None


class HospitalPushRequest(BaseModel):
    bundle: Dict[str, Any]
    target_system: str = "e-Hospital"


# ----------------------------------------------------
# 1. Configuration Check Endpoint
# ----------------------------------------------------
@router.get("/config/status")
def config_status():
    """Reports configuration state for ABDM credentials and HAPI FHIR URL."""
    return get_all_config_status()


# ----------------------------------------------------
# 2. ABHA Verification (Milestone M1)
# ----------------------------------------------------
@router.post("/abha/generate-otp")
def generate_abha_otp(req: AbhaOtpRequest):
    """Triggers OTP for ABHA ID verification in ABDM Sandbox."""
    try:
        return ABHAVerifier.generate_otp(
            patient_id=req.patient_id,
            abha_number_or_address=req.abha_identifier,
            auth_mode=req.auth_mode,
        )
    except MissingCredentialError as e:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={"error": "Missing ABDM Configuration", "variable": e.variable_name, "message": str(e)},
        )


@router.post("/abha/verify-otp")
def verify_abha_otp(req: AbhaVerifyRequest):
    """
    Verifies ABHA OTP. On success, replaces the stand-in patient ID
    with the verified ABHA ID for this session.
    """
    try:
        return ABHAVerifier.verify_otp(
            patient_id=req.patient_id,
            transaction_id=req.transaction_id,
            otp=req.otp,
            abha_identifier=req.abha_identifier,
        )
    except MissingCredentialError as e:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={"error": "Missing ABDM Configuration", "variable": e.variable_name, "message": str(e)},
        )


# ----------------------------------------------------
# 3. Consent Terms, Audio & Guardian Consent
# ----------------------------------------------------
class ConsentAsrRequest(BaseModel):
    audio_base64: str
    language: str = "en"


@router.get("/consent/terms")
def consent_terms(language: str = "en"):
    """Plain-language consent terms in patient's selected language."""
    return get_consent_text(language)


@router.get("/consent/audio")
def consent_audio(language: str = "en"):
    """
    Reads the complete consent terms aloud in the patient's language.
    Synthesizes spoken consent text using Bhashini TTS.
    """
    return ConsentAudioService.generate_consent_audio(language)


@router.post("/consent/asr")
def consent_asr(req: ConsentAsrRequest):
    """
    Transcribes patient voice consent response using Bhashini ASR.
    """
    from common.bhashini_client import transcribe_audio
    transcribed = transcribe_audio(req.audio_base64, language=req.language)
    if not transcribed:
        raise HTTPException(status_code=500, detail="Bhashini consent ASR failed.")
    return {"transcribed_text": transcribed, "language": req.language}



@router.post("/consent/guardian")
def verify_guardian(req: GuardianConsentRequest):
    """Validates guardian consent for minor patients."""
    res = GuardianConsentVerifier.verify_guardian_consent(
        patient_id=req.patient_id,
        is_minor=req.is_minor,
        guardian_name=req.guardian_name,
        guardian_relationship=req.guardian_relationship,
        guardian_phone=req.guardian_phone,
        guardian_confirmed=req.guardian_confirmed,
    )
    if not res.get("guardian_consent_granted") and req.is_minor:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=res)
    return res


from common.db import (
    insert_module_d_consent,
    fetch_module_d_consent,
    fetch_module_a_history,
    fetch_module_b_documents,
    fetch_module_c_summary,
)


# ----------------------------------------------------
# 4. Final Consent Submission & Real Session Clearing
# ----------------------------------------------------
@router.post("/consent/submit")
def submit_consent(req: ConsentSubmitRequest):
    """
    Submits patient consent, verifies guardian consent if minor,
    clears temporary session files from local storage[cite: 1],
    and returns exact output shape matching shared schemas[cite: 1].
    """
    if req.is_minor:
        g_res = GuardianConsentVerifier.verify_guardian_consent(
            patient_id=req.patient_id,
            is_minor=True,
            guardian_name=req.guardian_details.get("name") if req.guardian_details else None,
            guardian_relationship=req.guardian_details.get("relationship") if req.guardian_details else None,
            guardian_phone=req.guardian_details.get("phone") if req.guardian_details else None,
            guardian_confirmed=req.guardian_consent,
        )
        if not g_res.get("guardian_consent_granted"):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={"error": "Guardian Consent Required", "details": g_res},
            )

    session_abha = req.abha_id or get_verified_abha_for_session(req.patient_id)
    clean_res = SessionStorageManager.clear_session_data(req.patient_id)

    now_iso = datetime.now(timezone.utc).isoformat()
    output_record = {
        "patient_id": session_abha if session_abha else req.patient_id,
        "abha_id": session_abha,
        "consent_given": req.consent_given,
        "consent_timestamp": now_iso,
        "consent_language": req.consent_language,
        "consent_scope": req.consent_scope,
        "guardian_consent": req.guardian_consent if req.is_minor else False,
        "session_cleared": clean_res["session_cleared"],
    }
    insert_module_d_consent(req.patient_id, output_record)
    return output_record


# ----------------------------------------------------
# 5. FHIR Resource Generation & HAPI Server Validation
# ----------------------------------------------------
@router.post("/fhir/generate")
def generate_fhir(req: FHIRGenerateRequest):
    db_hist = fetch_module_a_history(req.patient_id)
    mod_a = req.module_a_data or (db_hist.get("extracted") if db_hist else None)
    
    mod_b_list = fetch_module_b_documents(req.patient_id)
    mod_b = req.module_b_data or (mod_b_list[-1] if mod_b_list else None)
    
    mod_c = req.module_c_data or fetch_module_c_summary(req.patient_id)

    bundle = FHIRResourceBuilder.assemble_bundle_from_modules(
        patient_id=req.patient_id,
        abha_id=req.abha_id or get_verified_abha_for_session(req.patient_id),
        module_a_data=mod_a,
        module_b_data=mod_b,
        module_c_data=mod_c,
    )
    return bundle


@router.post("/fhir/validate")
def validate_fhir(bundle: Dict[str, Any]):
    try:
        return FHIRBundleValidator.validate_against_hapi_server(bundle)
    except MissingCredentialError as e:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={"error": "Missing FHIR Configuration", "variable": e.variable_name, "message": str(e)},
        )


# ----------------------------------------------------
# 6. Fidelius Encryption & Decryption
# ----------------------------------------------------
@router.get("/crypto/keypair")
def generate_fidelius_keypair():
    km = KeyMaterial.generate()
    return {
        "private_key": km.private_key,
        "public_key": km.public_key,
        "x509_public_key": km.x509_public_key,
        "nonce": km.nonce,
        "curve": "Curve25519 (Short Weierstrass / BouncyCastle BC25519)",
    }


@router.post("/crypto/encrypt")
def fidelius_encrypt(req: EncryptDataRequest):
    enc_req = EncryptionRequest(
        sender_nonce=req.sender_nonce,
        requester_nonce=req.requester_nonce,
        sender_private_key=req.sender_private_key,
        requester_public_key=req.requester_public_key,
        string_to_encrypt=req.string_to_encrypt,
    )
    ciphertext_b64 = CryptoController.encrypt(enc_req)
    return {
        "encrypted_data": ciphertext_b64,
        "algorithm": "ECDH-BC25519 + HKDF-SHA256 + AES-256-GCM",
    }


@router.post("/crypto/decrypt")
def fidelius_decrypt(req: DecryptDataRequest):
    dec_req = DecryptionRequest(
        sender_nonce=req.sender_nonce,
        requester_nonce=req.requester_nonce,
        requester_private_key=req.requester_private_key,
        sender_public_key=req.sender_public_key,
        encrypted_data=req.encrypted_data,
    )
    decrypted_str = CryptoController.decrypt(dec_req)
    return {
        "decrypted_string": decrypted_str,
    }


# ----------------------------------------------------
# 7. ABDM Milestone M2 (HIP Linking & Data Push)
# ----------------------------------------------------
@router.post("/hip/link-context")
def hip_link_context(patient_id: str, abha_id: str):
    try:
        return HIPLinkingService.initiate_care_context_linking(patient_id=patient_id, abha_id=abha_id)
    except MissingCredentialError as e:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={"error": "Missing ABDM Configuration", "variable": e.variable_name, "message": str(e)},
        )


@router.post("/hip/push-data")
def hip_push_data(bundle: Dict[str, Any], hiu_public_key: str, hiu_nonce: str):
    return HIPLinkingService.push_encrypted_fhir_data(
        fhir_bundle=bundle,
        hiu_public_key=hiu_public_key,
        hiu_nonce=hiu_nonce,
    )


# ----------------------------------------------------
# 8. ABDM Milestone M3 (Signed Consent Artifact)
# ----------------------------------------------------
@router.post("/consent-manager/artifact")
def create_signed_consent_artifact(
    patient_id: str,
    abha_id: Optional[str] = None,
    language: str = "en",
    guardian_consent: bool = False,
):
    return ConsentManagerService.generate_signed_consent_artifact(
        patient_id=patient_id,
        abha_id=abha_id,
        language=language,
        guardian_consent=guardian_consent,
    )


# ----------------------------------------------------
# 9. Stand-in Hospital Receiving System
# ----------------------------------------------------
@router.post("/hospital/receive")
def hospital_receive(req: HospitalPushRequest):
    return HospitalReceivingRouter.receive_fhir_bundle(
        bundle=req.bundle,
        target_system=req.target_system,
    )


@router.get("/hospital/received-records")
def hospital_received_records():
    return HospitalReceivingRouter.get_received_records()