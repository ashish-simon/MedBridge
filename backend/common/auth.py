"""
MediKiosk Authentication & Authorization Router
Provides password-based registration and login endpoints for Doctor and Patient roles.
"""
import hashlib
import uuid
from typing import Optional
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from common.db import (
    create_user_in_db,
    fetch_user_by_username,
    fetch_user_by_id,
    fetch_all_patient_sessions,
    save_sessions_row
)

router = APIRouter()


class RegisterRequest(BaseModel):
    username: str
    password: str
    role: str  # 'patient', 'asha', 'doctor'
    full_name: Optional[str] = ""
    abha_id: Optional[str] = ""


class LoginRequest(BaseModel):
    username: str
    password: str
    role: str  # 'patient', 'asha', 'doctor'


def hash_password(password: str) -> str:
    """Computes PBKDF2 SHA256 password hash."""
    salt = "medikiosk_secure_salt_2026"
    return hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt.encode("utf-8"), 100000).hex()


def verify_password(password: str, password_hash: str) -> bool:
    """Verifies candidate password against stored hash."""
    return hash_password(password) == password_hash


@router.post("/register")
def register_user(req: RegisterRequest):
    """Registers a new user account across multi-tier roles."""
    if not req.username.strip() or not req.password.strip():
        raise HTTPException(status_code=400, detail="Username and password are required.")
    
    role = req.role.lower().strip()
    valid_roles = ["patient", "asha", "doctor"]
    if role not in valid_roles:
        raise HTTPException(status_code=400, detail=f"Role must be one of: {', '.join(valid_roles)}.")

    existing = fetch_user_by_username(req.username.strip())
    if existing:
        raise HTTPException(status_code=400, detail="Username is already registered. Please choose another username or log in.")

    # Generate user_id & patient_id prefix
    prefix_map = {"patient": "pat", "asha": "asha", "doctor": "doc"}
    user_id = f"{prefix_map.get(role, 'usr')}-{uuid.uuid4().hex[:8]}"
    pwd_hash = hash_password(req.password.strip())
    full_name = req.full_name.strip() or req.username.strip()

    created = create_user_in_db(
        user_id=user_id,
        username=req.username.strip(),
        password_hash=pwd_hash,
        role=role,
        full_name=full_name,
        abha_id=req.abha_id.strip() if req.abha_id else ""
    )

    if not created:
        raise HTTPException(status_code=500, detail="Failed to create user account.")

    # If patient, initialize session row in database
    if role == "patient":
        save_sessions_row(user_id)

    return {
        "user_id": user_id,
        "username": req.username.strip(),
        "role": role,
        "full_name": full_name,
        "patient_id": user_id if role == "patient" else None,
        "message": f"Successfully registered as {role.upper()}"
    }


@router.post("/login")
def login_user(req: LoginRequest):
    """Authenticates multi-tier role credentials."""
    username = req.username.strip()
    password = req.password.strip()
    target_role = req.role.lower().strip()

    user = fetch_user_by_username(username)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid username or password.")

    if not verify_password(password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid username or password.")

    if user["role"] != target_role:
        raise HTTPException(status_code=403, detail=f"Account is registered as '{user['role'].upper()}', not '{target_role.upper()}'. Please select the correct login tab.")

    patient_id = user["user_id"] if user["role"] == "patient" else None
    if patient_id:
        save_sessions_row(patient_id)

    return {
        "user_id": user["user_id"],
        "username": user["username"],
        "role": user["role"],
        "full_name": user["full_name"] or user["username"],
        "patient_id": patient_id,
        "abha_id": user.get("abha_id", "")
    }


@router.get("/patients")
def get_all_patients_queue():
    """Returns active patient queue for the physician dashboard."""
    patients = fetch_all_patient_sessions()
    return {
        "patient_count": len(patients),
        "patients": patients
    }
