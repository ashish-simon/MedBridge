import json
from pathlib import Path


# Directory where patient-document associations are stored
ASSOCIATION_DIR = (
    Path(__file__).resolve().parent
    / "storage"
    / "associations"
)

ASSOCIATION_DIR.mkdir(parents=True, exist_ok=True)


def get_association_file(patient_id: str) -> Path:
    """
    Returns the JSON file used to store document associations
    for a particular patient/session.
    """

    safe_patient_id = patient_id.replace("/", "_").replace("\\", "_")

    return ASSOCIATION_DIR / f"{safe_patient_id}.json"


def save_document_association(
    patient_id: str,
    document_id: str
) -> None:
    """
    Associates a newly generated document with a patient/session.

    If the patient already has an association file, the new
    document ID is added to the existing list.
    """

    association_file = get_association_file(patient_id)

    # Load existing association data
    if association_file.exists():
        try:
            data = json.loads(
                association_file.read_text(encoding="utf-8")
            )
        except (json.JSONDecodeError, OSError):
            data = {
                "patient_id": patient_id,
                "document_ids": []
            }
    else:
        data = {
            "patient_id": patient_id,
            "document_ids": []
        }

    # Make sure document_ids exists
    if "document_ids" not in data:
        data["document_ids"] = []

    # Avoid duplicate document IDs
    if document_id not in data["document_ids"]:
        data["document_ids"].append(document_id)

    # Save updated association
    association_file.write_text(
        json.dumps(data, indent=2),
        encoding="utf-8"
    )


def get_patient_document_ids(patient_id: str) -> list[str]:
    """
    Returns all document IDs associated with a patient/session.
    """

    association_file = get_association_file(patient_id)

    if not association_file.exists():
        return []

    try:
        data = json.loads(
            association_file.read_text(encoding="utf-8")
        )
    except (json.JSONDecodeError, OSError):
        return []

    return data.get("document_ids", [])