"""
Module D Configuration and Environment Management.

Reads secrets and endpoint configurations from environment variables or .env file.
Strictly checks:
    - ABDM_CLIENT_ID
    - ABDM_CLIENT_SECRET
    - ABDM_SANDBOX_BASE_URL
    - HAPI_FHIR_BASE_URL

Fails gracefully with clear error messages if any required variable is missing/blank.
"""

import os
from pathlib import Path
from typing import Dict, List, Optional
from dotenv import load_dotenv

_BACKEND_DIR = Path(__file__).resolve().parents[1]
_PROJECT_DIR = _BACKEND_DIR.parent
_ENV_LOCATIONS = [
    Path.cwd() / ".env",
    _BACKEND_DIR / ".env",
    _PROJECT_DIR / ".env",
    Path(__file__).resolve().parent / ".env",
]

for _env_path in _ENV_LOCATIONS:
    if _env_path.exists():
        load_dotenv(dotenv_path=_env_path, override=False)
        break


class MissingCredentialError(Exception):
    """Raised when an expected ABDM or FHIR credential is missing or blank."""

    def __init__(self, variable_name: str, description: str = ""):
        self.variable_name = variable_name
        self.description = description
        msg = (
            f"Configuration Error: Environment variable '{variable_name}' is missing or blank. "
            f"Please set '{variable_name}' in your .env file. ({description})"
            if description
            else f"Configuration Error: Environment variable '{variable_name}' is missing or blank. "
            f"Please set '{variable_name}' in your .env file."
        )
        super().__init__(msg)


def get_required_env(var_name: str, description: str = "") -> str:
    val = os.getenv(var_name, "").strip()
    if not val:
        raise MissingCredentialError(var_name, description)
    return val


def get_optional_env(var_name: str, default: str = "") -> str:
    val = os.getenv(var_name, "").strip()
    return val if val else default


class ABDMConfig:
    @classmethod
    def get_client_id(cls) -> str:
        return get_required_env("ABDM_CLIENT_ID", "ABDM Sandbox client ID")

    @classmethod
    def get_client_secret(cls) -> str:
        return get_required_env("ABDM_CLIENT_SECRET", "ABDM Sandbox client secret")

    @classmethod
    def get_sandbox_base_url(cls) -> str:
        return get_required_env(
            "ABDM_SANDBOX_BASE_URL", "ABDM Sandbox base URL, e.g. https://sandbox.abdm.gov.in"
        )

    @classmethod
    def check_credentials(cls) -> Dict[str, bool]:
        return {
            "ABDM_CLIENT_ID": bool(os.getenv("ABDM_CLIENT_ID", "").strip()),
            "ABDM_CLIENT_SECRET": bool(os.getenv("ABDM_CLIENT_SECRET", "").strip()),
            "ABDM_SANDBOX_BASE_URL": bool(os.getenv("ABDM_SANDBOX_BASE_URL", "").strip()),
        }

    @classmethod
    def validate(cls) -> None:
        cls.get_client_id()
        cls.get_client_secret()
        cls.get_sandbox_base_url()


class FHIRConfig:
    @classmethod
    def get_hapi_fhir_base_url(cls) -> str:
        return get_required_env(
            "HAPI_FHIR_BASE_URL", "HAPI FHIR server base URL, e.g. http://localhost:8080/fhir"
        )

    @classmethod
    def check_credentials(cls) -> Dict[str, bool]:
        return {
            "HAPI_FHIR_BASE_URL": bool(os.getenv("HAPI_FHIR_BASE_URL", "").strip())
        }

    @classmethod
    def validate(cls) -> None:
        cls.get_hapi_fhir_base_url()


def get_all_config_status() -> Dict[str, any]:
    variables = [
        ("ABDM_CLIENT_ID", "ABDM Sandbox client ID"),
        ("ABDM_CLIENT_SECRET", "ABDM Sandbox client secret"),
        ("ABDM_SANDBOX_BASE_URL", "ABDM Sandbox base URL"),
        ("HAPI_FHIR_BASE_URL", "HAPI FHIR server URL"),
    ]
    status = {}
    all_set = True
    for var, desc in variables:
        val = os.getenv(var, "").strip()
        is_set = bool(val)
        status[var] = {
            "configured": is_set,
            "description": desc,
            "preview": (val[:4] + "..." + val[-2:]) if (is_set and "SECRET" in var and len(val) > 6) else (val if not "SECRET" in var else "***") if is_set else None
        }
        if not is_set:
            all_set = False

    return {
        "all_required_configured": all_set,
        "variables": status,
    }
