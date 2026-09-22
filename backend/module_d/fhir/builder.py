"""
NRCeS ABDM HL7 FHIR R4 Resource Generator.

Converts JSON outputs from:
- Module A (Interview, symptoms, chief complaint, HPI, allergies, review of systems)
- Module B (OCR extracted prescriptions, lab tests, investigations)
- Module C (Structured clinical summary, SNOMED-CT, ICD-10, LOINC codings)

Produces valid HL7 FHIR R4 Bundle conforming to NRCeS ABDM Implementation Guides:
- Patient: https://nrces.in/ndhm/fhir/r4/StructureDefinition/Patient
- Condition: https://nrces.in/ndhm/fhir/r4/StructureDefinition/Condition
- Observation: https://nrces.in/ndhm/fhir/r4/StructureDefinition/Observation
- MedicationStatement: https://nrces.in/ndhm/fhir/r4/StructureDefinition/MedicationStatement
- OPConsultRecord Bundle: https://nrces.in/ndhm/fhir/r4/StructureDefinition/OPConsultRecord
"""

import uuid
from datetime import datetime, timezone
from typing import Dict, Any, List, Optional


class FHIRResourceBuilder:
    """Builds NRCeS ABDM compliant FHIR R4 resources."""

    @classmethod
    def build_patient(cls, patient_id: str, abha_id: Optional[str] = None, name: str = "OPD Patient") -> Dict[str, Any]:
        """Builds FHIR R4 Patient resource."""
        effective_id = abha_id or patient_id
        identifiers = [
            {
                "system": "https://medikiosk.in/patient-id",
                "value": patient_id,
            }
        ]
        if abha_id:
            identifiers.append({
                "system": "https://healthid.ndhm.gov.in",
                "value": abha_id,
                "type": {
                    "coding": [
                        {
                            "system": "http://terminology.hl7.org/CodeSystem/v2-0203",
                            "code": "MR",
                            "display": "Medical record number",
                        }
                    ]
                }
            })

        return {
            "resourceType": "Patient",
            "id": f"pat-{uuid.uuid4().hex[:8]}",
            "meta": {
                "profile": ["https://nrces.in/ndhm/fhir/r4/StructureDefinition/Patient"],
            },
            "identifier": identifiers,
            "active": True,
            "name": [
                {
                    "text": name,
                    "use": "official",
                }
            ],
            "gender": "unknown",
        }

    @classmethod
    def build_condition(
        cls,
        patient_ref: str,
        display_name: str,
        snomed_code: Optional[str] = None,
        icd_code: Optional[str] = None,
        onset_string: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Builds FHIR R4 Condition resource."""
        codings = []
        if snomed_code:
            codings.append({
                "system": "http://snomed.info/sct",
                "code": snomed_code,
                "display": display_name,
            })
        if icd_code:
            codings.append({
                "system": "http://hl7.org/fhir/sid/icd-10",
                "code": icd_code,
                "display": display_name,
            })
        if not codings:
            codings.append({
                "system": "https://medikiosk.in/codes",
                "code": "CLINICAL-CONDITION",
                "display": display_name,
            })

        res = {
            "resourceType": "Condition",
            "id": f"cond-{uuid.uuid4().hex[:8]}",
            "meta": {
                "profile": ["https://nrces.in/ndhm/fhir/r4/StructureDefinition/Condition"],
            },
            "clinicalStatus": {
                "coding": [
                    {
                        "system": "http://terminology.hl7.org/CodeSystem/condition-clinical",
                        "code": "active",
                    }
                ]
            },
            "verificationStatus": {
                "coding": [
                    {
                        "system": "http://terminology.hl7.org/CodeSystem/condition-ver-status",
                        "code": "confirmed",
                    }
                ]
            },
            "category": [
                {
                    "coding": [
                        {
                            "system": "http://terminology.hl7.org/CodeSystem/condition-category",
                            "code": "problem-list-item",
                            "display": "Problem List Item",
                        }
                    ]
                }
            ],
            "code": {
                "coding": codings,
                "text": display_name,
            },
            "subject": {
                "reference": patient_ref,
            },
            "recordedDate": datetime.now(timezone.utc).isoformat(),
        }
        if onset_string:
            res["onsetString"] = onset_string
        return res

    @classmethod
    def build_observation(
        cls,
        patient_ref: str,
        test_name: str,
        value: str,
        reference_range: Optional[str] = None,
        is_abnormal: bool = False,
        loinc_code: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Builds FHIR R4 Observation resource."""
        codings = []
        if loinc_code:
            codings.append({
                "system": "http://loinc.org",
                "code": loinc_code,
                "display": test_name,
            })
        else:
            codings.append({
                "system": "https://medikiosk.in/tests",
                "code": test_name.lower().replace(" ", "-"),
                "display": test_name,
            })

        obs = {
            "resourceType": "Observation",
            "id": f"obs-{uuid.uuid4().hex[:8]}",
            "meta": {
                "profile": ["https://nrces.in/ndhm/fhir/r4/StructureDefinition/Observation"],
            },
            "status": "final",
            "category": [
                {
                    "coding": [
                        {
                            "system": "http://terminology.hl7.org/CodeSystem/observation-category",
                            "code": "laboratory",
                            "display": "Laboratory",
                        }
                    ]
                }
            ],
            "code": {
                "coding": codings,
                "text": test_name,
            },
            "subject": {
                "reference": patient_ref,
            },
            "effectiveDateTime": datetime.now(timezone.utc).isoformat(),
            "valueString": value,
        }
        if reference_range:
            obs["referenceRange"] = [{"text": reference_range}]
        if is_abnormal:
            obs["interpretation"] = [
                {
                    "coding": [
                        {
                            "system": "http://terminology.hl7.org/CodeSystem/v3-ObservationInterpretation",
                            "code": "A",
                            "display": "Abnormal",
                        }
                    ]
                }
            ]
        return obs

    @classmethod
    def build_medication_statement(cls, patient_ref: str, med_name: str, dosage: str) -> Dict[str, Any]:
        """Builds FHIR R4 MedicationStatement resource."""
        return {
            "resourceType": "MedicationStatement",
            "id": f"med-{uuid.uuid4().hex[:8]}",
            "meta": {
                "profile": ["https://nrces.in/ndhm/fhir/r4/StructureDefinition/MedicationStatement"],
            },
            "status": "active",
            "medicationCodeableConcept": {
                "text": med_name,
                "coding": [
                    {
                        "system": "https://medikiosk.in/medications",
                        "code": med_name.lower().replace(" ", "-"),
                        "display": med_name,
                    }
                ],
            },
            "subject": {
                "reference": patient_ref,
            },
            "dosage": [
                {
                    "text": dosage,
                }
            ],
        }

    @classmethod
    def build_composition(
        cls,
        patient_ref: str,
        section_entries: List[Dict[str, Any]],
        title: str = "OPD Consultation Record",
    ) -> Dict[str, Any]:
        """Builds FHIR R4 Composition resource."""
        sections = [
            {
                "title": "Clinical History and Findings",
                "entry": [{"reference": f"{res['resourceType']}/{res['id']}"} for res in section_entries],
            }
        ]
        return {
            "resourceType": "Composition",
            "id": f"comp-{uuid.uuid4().hex[:8]}",
            "meta": {
                "profile": ["https://nrces.in/ndhm/fhir/r4/StructureDefinition/OPConsultRecord"],
            },
            "status": "final",
            "type": {
                "coding": [
                    {
                        "system": "http://snomed.info/sct",
                        "code": "371530004",
                        "display": "Clinical consultation report",
                    }
                ],
                "text": "Outpatient Consultation Note",
            },
            "subject": {
                "reference": patient_ref,
            },
            "date": datetime.now(timezone.utc).isoformat(),
            "author": [
                {
                    "display": "MediKiosk Patient Intake System",
                }
            ],
            "title": title,
            "section": sections,
        }

    @classmethod
    def assemble_bundle_from_modules(
        cls,
        patient_id: str,
        abha_id: Optional[str] = None,
        module_a_data: Optional[Dict[str, Any]] = None,
        module_b_data: Optional[Dict[str, Any]] = None,
        module_c_data: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """
        Takes raw outputs from Module A, B, and C, creates all NRCeS FHIR resources,
        and wraps them into a FHIR R4 document Bundle.
        """
        resources = []

        # 1. Patient
        pat = cls.build_patient(patient_id=patient_id, abha_id=abha_id)
        pat_ref = f"Patient/{pat['id']}"
        resources.append(pat)

        # 2. Conditions from Module A & C
        if module_a_data and module_a_data.get("chief_complaint"):
            cc = module_a_data["chief_complaint"]
            hpi = module_a_data.get("hpi", {})
            onset = hpi.get("onset") if isinstance(hpi, dict) else None
            cond = cls.build_condition(pat_ref, display_name=cc, onset_string=onset)
            resources.append(cond)

        if module_c_data:
            codings = module_c_data.get("coding", {})
            snomed_list = codings.get("snomed_ct", [])
            icd_list = codings.get("icd_10_11", [])
            snomed = snomed_list[0] if snomed_list else None
            icd = icd_list[0] if icd_list else None
            if module_c_data.get("chief_complaint"):
                cond_c = cls.build_condition(
                    pat_ref,
                    display_name=module_c_data["chief_complaint"],
                    snomed_code=snomed,
                    icd_code=icd,
                )
                resources.append(cond_c)

        # 3. Medications from Module B
        if module_b_data and "medications" in module_b_data:
            for med in module_b_data["medications"]:
                name = med.get("name", "Unknown Medication")
                dosage = med.get("dosage", "As directed")
                ms = cls.build_medication_statement(pat_ref, med_name=name, dosage=dosage)
                resources.append(ms)

        # 4. Investigations / Observations from Module B
        if module_b_data and "investigations" in module_b_data:
            for inv in module_b_data["investigations"]:
                tname = inv.get("test_name", "Laboratory Test")
                val = inv.get("value", "")
                rr = inv.get("reference_range")
                abn = inv.get("flagged_abnormal", False)
                obs = cls.build_observation(
                    pat_ref, test_name=tname, value=val, reference_range=rr, is_abnormal=abn
                )
                resources.append(obs)

        # 5. Composition document
        comp = cls.build_composition(pat_ref, resources)

        bundle_entries = [{"fullUrl": f"urn:uuid:{comp['id']}", "resource": comp}]
        for r in resources:
            bundle_entries.append({"fullUrl": f"urn:uuid:{r['id']}", "resource": r})

        bundle = {
            "resourceType": "Bundle",
            "id": f"bundle-{uuid.uuid4().hex[:12]}",
            "meta": {
                "profile": ["https://nrces.in/ndhm/fhir/r4/StructureDefinition/OPConsultRecord"],
            },
            "identifier": {
                "system": "https://medikiosk.in/bundles",
                "value": f"bundle-{uuid.uuid4().hex[:12]}",
            },
            "type": "document",
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "entry": bundle_entries,
        }
        return bundle
