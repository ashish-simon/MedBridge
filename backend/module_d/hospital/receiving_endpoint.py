"""
Stand-in Hospital Receiving Endpoint.

/* stand-in receiving system — real e-Hospital/A-HMIS integration requires hospital IT partnership */

This module provides an internal mock receiving endpoint that mimics how an Indian hospital's
e-Hospital/ORS or A-HMIS intake router would receive an HL7 FHIR R4 clinical consultation bundle.
It stores received records in an in-memory audit log so judges and developers can inspect
the pushed clinical bundle end-to-end.
"""

import uuid
from datetime import datetime, timezone
from typing import Dict, Any, List

# In-memory store for bundles received by the stand-in hospital router
_RECEIVED_HOSPITAL_BUNDLES: List[Dict[str, Any]] = []


class HospitalReceivingRouter:
    """Stand-in hospital receiving system (e-Hospital / A-HMIS intake)."""

    SYSTEM_NOTICE = (
        "/* stand-in receiving system — real e-Hospital/A-HMIS integration requires hospital IT partnership */"
    )

    @classmethod
    def receive_fhir_bundle(cls, bundle: Dict[str, Any], target_system: str = "e-Hospital") -> Dict[str, Any]:
        """
        Receives an HL7 FHIR R4 bundle in the exact format e-Hospital / A-HMIS expects.
        """
        record_id = f"HOSP-REC-{uuid.uuid4().hex[:8]}"
        now = datetime.now(timezone.utc).isoformat()

        entry_summary = []
        for e in bundle.get("entry", []):
            res = e.get("resource", {})
            entry_summary.append({
                "resourceType": res.get("resourceType"),
                "id": res.get("id"),
            })

        stored_record = {
            "hospital_record_id": record_id,
            "received_at": now,
            "target_system": target_system,
            "bundle_id": bundle.get("id"),
            "bundle_type": bundle.get("type"),
            "resources_received": entry_summary,
            "full_bundle": bundle,
            "integration_notice": cls.SYSTEM_NOTICE,
        }
        _RECEIVED_HOSPITAL_BUNDLES.append(stored_record)

        return {
            "status": "ACCEPTED",
            "hospital_record_id": record_id,
            "target_system": target_system,
            "message": f"Bundle successfully routed to {target_system} OPD receiving queue.",
            "resources_indexed": len(entry_summary),
            "notice": cls.SYSTEM_NOTICE,
        }

    @classmethod
    def get_received_records(cls) -> List[Dict[str, Any]]:
        """Returns all received hospital bundles for audit and demonstration."""
        return _RECEIVED_HOSPITAL_BUNDLES
