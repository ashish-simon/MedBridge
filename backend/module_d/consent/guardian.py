"""
Guardian Consent Verification for Minor Patients.

Under DPDP Act 2023, processing personal medical data of minors requires verifiable
guardian authorization. This module blocks progression until guardian confirmation is recorded.
"""

from typing import Dict, Any, Optional


class GuardianConsentVerifier:
    """Manages guardian verification step for minor patients."""

    @classmethod
    def verify_guardian_consent(
        cls,
        patient_id: str,
        is_minor: bool,
        guardian_name: Optional[str] = None,
        guardian_relationship: Optional[str] = None,
        guardian_phone: Optional[str] = None,
        guardian_confirmed: bool = False,
    ) -> Dict[str, Any]:
        """
        Validates guardian consent requirement.
        If is_minor is True, guardian details and confirmation are strictly enforced.
        """
        if not is_minor:
            return {
                "guardian_consent_required": False,
                "guardian_consent_granted": False,
                "message": "Patient is an adult. Guardian consent not required.",
            }

        # Minor flow
        if not guardian_confirmed:
            return {
                "guardian_consent_required": True,
                "guardian_consent_granted": False,
                "error": "Guardian confirmation required",
                "message": "Patient is marked as a minor. A parent or legal guardian must independently review and authorize.",
            }

        if not guardian_name or not guardian_relationship:
            return {
                "guardian_consent_required": True,
                "guardian_consent_granted": False,
                "error": "Missing guardian details",
                "message": "Guardian's full name and relationship must be provided.",
            }

        return {
            "guardian_consent_required": True,
            "guardian_consent_granted": True,
            "guardian_name": guardian_name.strip(),
            "guardian_relationship": guardian_relationship.strip(),
            "guardian_phone": guardian_phone.strip() if guardian_phone else None,
            "message": f"Guardian consent verified by {guardian_name} ({guardian_relationship}).",
        }
