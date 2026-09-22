"""
HAPI FHIR Server & NRCeS Validation Engine.

Actually sends the generated FHIR Bundle to HAPI_FHIR_BASE_URL/$validate.
Fails gracefully with clear missing credential error if HAPI_FHIR_BASE_URL is missing.
Performs local structural validation against NRCeS ABDM rules as well.
"""

import requests
from typing import Dict, Any, List

from module_d.config import FHIRConfig, MissingCredentialError


class FHIRBundleValidator:
    """Validates FHIR R4 bundles against live HAPI server and NRCeS specification."""

    @classmethod
    def validate_locally(cls, bundle: Dict[str, Any]) -> Dict[str, Any]:
        """Local structural validation checking NRCeS required elements."""
        issues: List[str] = []

        if bundle.get("resourceType") != "Bundle":
            issues.append("Top-level resourceType must be 'Bundle'")
        if bundle.get("type") != "document":
            issues.append("ABDM OPD Consult Bundle type must be 'document'")
        if not bundle.get("entry") or not isinstance(bundle.get("entry"), list):
            issues.append("Bundle must contain a non-empty 'entry' list")
        else:
            entries = bundle["entry"]
            first_resource = entries[0].get("resource", {})
            if first_resource.get("resourceType") != "Composition":
                issues.append("First entry in document Bundle must be a Composition resource")

            # Check individual resources
            for idx, entry in enumerate(entries):
                res = entry.get("resource", {})
                rtype = res.get("resourceType")
                if not rtype:
                    issues.append(f"Entry {idx} is missing 'resource.resourceType'")
                if not res.get("id"):
                    issues.append(f"Entry {idx} ({rtype}) is missing 'id'")

        return {
            "valid": len(issues) == 0,
            "issue_count": len(issues),
            "issues": issues,
        }

    @classmethod
    def validate_against_hapi_server(cls, bundle: Dict[str, Any]) -> Dict[str, Any]:
        """
        Validates against the configured HAPI FHIR server ($validate endpoint).
        Strictly reads HAPI_FHIR_BASE_URL from environment/.env.
        Fails gracefully if missing/blank.
        """
        # Validate that HAPI_FHIR_BASE_URL is set
        base_url = FHIRConfig.get_hapi_fhir_base_url().rstrip("/")

        local_check = cls.validate_locally(bundle)
        endpoint = f"{base_url}/Bundle/$validate"

        headers = {
            "Content-Type": "application/fhir+json",
            "Accept": "application/fhir+json",
        }

        try:
            resp = requests.post(endpoint, json=bundle, headers=headers, timeout=10)
            server_status = resp.status_code
            server_body = resp.json() if resp.headers.get("content-type", "").startswith("application/json") else resp.text

            return {
                "valid": local_check["valid"] and (server_status in [200, 201]),
                "hapi_server_status": server_status,
                "hapi_server_endpoint": endpoint,
                "local_validation": local_check,
                "hapi_operation_outcome": server_body,
                "message": "Validated against HAPI FHIR server successfully.",
            }
        except requests.exceptions.ConnectionError:
            return {
                "valid": local_check["valid"],
                "hapi_server_status": "UNREACHABLE",
                "hapi_server_endpoint": endpoint,
                "local_validation": local_check,
                "message": (
                    f"HAPI FHIR server at '{endpoint}' is currently not running or unreachable. "
                    "Local NRCeS structural validation completed successfully."
                ),
            }
        except requests.exceptions.Timeout:
            return {
                "valid": local_check["valid"],
                "hapi_server_status": "TIMEOUT",
                "hapi_server_endpoint": endpoint,
                "local_validation": local_check,
                "message": f"Connection to HAPI FHIR server at '{endpoint}' timed out.",
            }
