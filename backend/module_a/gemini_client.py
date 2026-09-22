"""
Clinical Interview Engine
-------------------------

Backend module for a React-based patient interview application.

Supported modes:
    - standard: Allopathic history taking
    - ayush:    Ayurvedic Dashavidha Pariksha

Design goals:
    - Structured Gemini output
    - Pydantic validation
    - Persistent interview state
    - Recent conversation only
    - Multilingual patient-facing questions/options
    - Robust retries and model fallback
    - No diagnosis/treatment generation
    - Explicit unknown/denied/not-applicable states
"""

from __future__ import annotations

import json
import logging
import os
import time
from typing import Any, Dict, List, Literal, Optional, Tuple

import requests
from dotenv import load_dotenv
from pydantic import BaseModel, ConfigDict, Field, ValidationError


# ============================================================================
# ENVIRONMENT
# ============================================================================

load_dotenv()


# ============================================================================
# LOGGING
# ============================================================================

logger = logging.getLogger("clinical_interview")

if not logger.handlers:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s | %(levelname)s | %(name)s | %(message)s",
    )


# ============================================================================
# CONSTANTS
# ============================================================================

GEMINI_BASE_URL = (
    "https://generativelanguage.googleapis.com/v1beta/models"
)

DEFAULT_TIMEOUT_SECONDS = 45

# Keep a known-good fallback chain.
#
# The first model is tried first.
# If the model is unavailable, rate-limited, or temporarily fails,
# the next model is attempted.
MODELS_TO_TRY = [
    "gemini-3.1-flash-lite",
    "gemini-3.7-flash",
]

RECENT_HISTORY_LIMIT = 8

MAX_TRANSIENT_RETRIES = 2

VALID_MODES = {
    "standard",
    "ayush",
}

VALID_LANGUAGES = {
    "en",
    "hi",
    "te",
}

FieldStatus = Literal[
    "answered",
    "unknown",
    "denied",
    "not_applicable",
]


# ============================================================================
# API KEY
# ============================================================================

def get_gemini_api_key() -> str:
    """
    Resolve Gemini API key.

    Priority:
        1. GEMINI_API_KEY_MODULE_A
        2. GEMINI_API_KEY
        3. GOOGLE_API_KEY
    """

    return (
        os.getenv("GEMINI_API_KEY_MODULE_A")
        or os.getenv("GEMINI_API_KEY")
        or os.getenv("GOOGLE_API_KEY")
        or ""
    )


# ============================================================================
# PYDANTIC MODELS
# ============================================================================

class FieldValue(BaseModel):
    """
    One structured clinical field.
    """

    model_config = ConfigDict(extra="forbid")

    value: Optional[str] = None

    status: FieldStatus = "unknown"


# ----------------------------------------------------------------------------
# STANDARD / ALLOPATHIC
# ----------------------------------------------------------------------------

class StandardHPI(BaseModel):
    model_config = ConfigDict(extra="forbid")

    site: FieldValue = Field(default_factory=FieldValue)
    onset: FieldValue = Field(default_factory=FieldValue)
    character: FieldValue = Field(default_factory=FieldValue)
    radiation: FieldValue = Field(default_factory=FieldValue)
    associations: FieldValue = Field(default_factory=FieldValue)
    timing: FieldValue = Field(default_factory=FieldValue)
    aggravating_factors: FieldValue = Field(default_factory=FieldValue)
    relieving_factors: FieldValue = Field(default_factory=FieldValue)
    severity: FieldValue = Field(default_factory=FieldValue)


class StandardExtractedFields(BaseModel):
    model_config = ConfigDict(extra="forbid")

    chief_complaint: FieldValue = Field(default_factory=FieldValue)

    hpi: StandardHPI = Field(default_factory=StandardHPI)

    past_medical_history: List[str] = Field(default_factory=list)

    past_surgical_history: List[str] = Field(default_factory=list)

    drug_allergy_history: List[str] = Field(default_factory=list)

    family_history: List[str] = Field(default_factory=list)

    personal_history: List[str] = Field(default_factory=list)

    review_of_systems: List[str] = Field(default_factory=list)


# ----------------------------------------------------------------------------
# AYUSH
# ----------------------------------------------------------------------------

class AyushFields(BaseModel):
    model_config = ConfigDict(extra="forbid")

    prakriti: FieldValue = Field(default_factory=FieldValue)
    vikriti: FieldValue = Field(default_factory=FieldValue)
    sara: FieldValue = Field(default_factory=FieldValue)
    samhanana: FieldValue = Field(default_factory=FieldValue)
    pramana: FieldValue = Field(default_factory=FieldValue)
    satmya: FieldValue = Field(default_factory=FieldValue)
    sattva: FieldValue = Field(default_factory=FieldValue)
    ahara_shakti: FieldValue = Field(default_factory=FieldValue)
    vyayama_shakti: FieldValue = Field(default_factory=FieldValue)
    vaya: FieldValue = Field(default_factory=FieldValue)


class AyushExtractedFields(BaseModel):
    model_config = ConfigDict(extra="forbid")

    chief_complaint: FieldValue = Field(default_factory=FieldValue)

    ayush: AyushFields = Field(default_factory=AyushFields)


# ----------------------------------------------------------------------------
# COMMON MODEL RESPONSE
# ----------------------------------------------------------------------------

class InterviewResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    extracted_fields: Dict[str, Any]

    next_question: str

    suggested_options: List[str]

    is_complete: bool


# ============================================================================
# LANGUAGE CONFIGURATION
# ============================================================================

LANGUAGE_INSTRUCTIONS: Dict[str, str] = {
    "en": (
        "Use simple, clear English suitable for a first-time patient. "
        "Avoid unnecessary medical jargon."
    ),

    "hi": (
        "Use simple Hindi (हिन्दी) suitable for a first-time, "
        "low-literacy patient. Avoid unnecessary English medical jargon."
    ),

    "te": (
        "Use simple Telugu (తెలుగు) suitable for a first-time, "
        "low-literacy patient. Avoid unnecessary English medical jargon."
    ),
}


# ============================================================================
# STATUS HELPERS
# ============================================================================

VALID_STATUSES = {
    "answered",
    "unknown",
    "denied",
    "not_applicable",
}


def normalize_field_value(raw: Any) -> FieldValue:
    """
    Convert arbitrary model output into a safe FieldValue.
    """

    if isinstance(raw, FieldValue):
        return raw

    if not isinstance(raw, dict):
        return FieldValue(
            value=None,
            status="unknown",
        )

    value = raw.get("value")

    status = raw.get(
        "status",
        "unknown",
    )

    if status not in VALID_STATUSES:
        status = "unknown"

    if value is not None:
        value = str(value).strip()

        if not value:
            value = None

    if status in {
        "denied",
        "not_applicable",
    }:
        value = None

    return FieldValue(
        value=value,
        status=status,
    )


# ============================================================================
# STATE MERGING
# ============================================================================

def merge_field_value(
    previous: FieldValue,
    new: FieldValue,
) -> FieldValue:
    """
    Merge a newly extracted field with persistent state.

    Existing valid information is not erased by an unknown response.
    """

    # Explicit new answer.
    if new.status == "answered" and new.value:
        return new

    # Explicit denial.
    if new.status == "denied":
        return new

    # Explicit not applicable.
    if new.status == "not_applicable":
        return new

    # Unknown should not erase an existing answer.
    if new.status == "unknown":

        if (
            previous.status == "answered"
            and previous.value
        ):
            return previous

        if previous.status in {
            "denied",
            "not_applicable",
        }:
            return previous

        return new

    return previous


def merge_string_lists(
    previous: List[str],
    new: List[str],
) -> List[str]:
    """
    Merge history lists without duplicates.
    """

    result: List[str] = []

    for item in previous + new:

        if not isinstance(item, str):
            continue

        item = item.strip()

        if not item:
            continue

        existing_lower = {
            existing.lower()
            for existing in result
        }

        if item.lower() not in existing_lower:
            result.append(item)

    return result


def merge_standard_hpi(
    previous: StandardHPI,
    new: StandardHPI,
) -> StandardHPI:

    return StandardHPI(
        site=merge_field_value(
            previous.site,
            new.site,
        ),

        onset=merge_field_value(
            previous.onset,
            new.onset,
        ),

        character=merge_field_value(
            previous.character,
            new.character,
        ),

        radiation=merge_field_value(
            previous.radiation,
            new.radiation,
        ),

        associations=merge_field_value(
            previous.associations,
            new.associations,
        ),

        timing=merge_field_value(
            previous.timing,
            new.timing,
        ),

        aggravating_factors=merge_field_value(
            previous.aggravating_factors,
            new.aggravating_factors,
        ),

        relieving_factors=merge_field_value(
            previous.relieving_factors,
            new.relieving_factors,
        ),

        severity=merge_field_value(
            previous.severity,
            new.severity,
        ),
    )


def merge_standard_state(
    previous: StandardExtractedFields,
    new: StandardExtractedFields,
) -> StandardExtractedFields:

    return StandardExtractedFields(

        chief_complaint=merge_field_value(
            previous.chief_complaint,
            new.chief_complaint,
        ),

        hpi=merge_standard_hpi(
            previous.hpi,
            new.hpi,
        ),

        past_medical_history=merge_string_lists(
            previous.past_medical_history,
            new.past_medical_history,
        ),

        past_surgical_history=merge_string_lists(
            previous.past_surgical_history,
            new.past_surgical_history,
        ),

        drug_allergy_history=merge_string_lists(
            previous.drug_allergy_history,
            new.drug_allergy_history,
        ),

        family_history=merge_string_lists(
            previous.family_history,
            new.family_history,
        ),

        personal_history=merge_string_lists(
            previous.personal_history,
            new.personal_history,
        ),

        review_of_systems=merge_string_lists(
            previous.review_of_systems,
            new.review_of_systems,
        ),
    )


def merge_ayush_state(
    previous: AyushExtractedFields,
    new: AyushExtractedFields,
) -> AyushExtractedFields:

    previous_ayush = previous.ayush

    new_ayush = new.ayush

    merged_ayush = AyushFields(

        prakriti=merge_field_value(
            previous_ayush.prakriti,
            new_ayush.prakriti,
        ),

        vikriti=merge_field_value(
            previous_ayush.vikriti,
            new_ayush.vikriti,
        ),

        sara=merge_field_value(
            previous_ayush.sara,
            new_ayush.sara,
        ),

        samhanana=merge_field_value(
            previous_ayush.samhanana,
            new_ayush.samhanana,
        ),

        pramana=merge_field_value(
            previous_ayush.pramana,
            new_ayush.pramana,
        ),

        satmya=merge_field_value(
            previous_ayush.satmya,
            new_ayush.satmya,
        ),

        sattva=merge_field_value(
            previous_ayush.sattva,
            new_ayush.sattva,
        ),

        ahara_shakti=merge_field_value(
            previous_ayush.ahara_shakti,
            new_ayush.ahara_shakti,
        ),

        vyayama_shakti=merge_field_value(
            previous_ayush.vyayama_shakti,
            new_ayush.vyayama_shakti,
        ),

        vaya=merge_field_value(
            previous_ayush.vaya,
            new_ayush.vaya,
        ),
    )

    return AyushExtractedFields(

        chief_complaint=merge_field_value(
            previous.chief_complaint,
            new.chief_complaint,
        ),

        ayush=merged_ayush,
    )


# ============================================================================
# COMPLETION LOGIC
# ============================================================================

def is_field_complete(
    field: FieldValue,
) -> bool:

    return field.status in {
        "answered",
        "denied",
        "not_applicable",
    }


def standard_state_is_complete(
    state: StandardExtractedFields,
    history_length: int = 0,
) -> bool:
    """
    Standard Allopathic history taking completion check.
    Requires:
    1. Chief complaint answered.
    2. At least 6 HPI fields answered, denied, or not_applicable.
    3. Past history / allergies / family or personal history addressed (or at least 11 turns completed).
    """
    if not is_field_complete(state.chief_complaint):
        return False

    hpi = state.hpi
    hpi_fields = [
        hpi.site,
        hpi.onset,
        hpi.character,
        hpi.radiation,
        hpi.associations,
        hpi.timing,
        hpi.aggravating_factors,
        hpi.relieving_factors,
        hpi.severity,
    ]

    # At least 6 HPI fields must be completed
    completed_hpi_count = sum(1 for f in hpi_fields if is_field_complete(f))
    if completed_hpi_count < 6:
        return False

    # Ensure past medical history, allergies, or personal lifestyle info has been collected
    has_past_info = bool(
        state.past_medical_history
        or state.past_surgical_history
        or state.drug_allergy_history
        or state.family_history
        or state.personal_history
    )

    if not has_past_info and history_length < 11:
        return False

    return True


def ayush_state_is_complete(
    state: AyushExtractedFields,
    history_length: int = 0,
) -> bool:
    """
    AYUSH Ayurvedic Dashavidha Pariksha completion check.
    Requires chief complaint + core Dashavidha Pariksha parameters (at least 7 parameters evaluated and 7+ turns).
    """
    if not is_field_complete(state.chief_complaint):
        return False

    fields = [
        state.ayush.prakriti,
        state.ayush.vikriti,
        state.ayush.sara,
        state.ayush.samhanana,
        state.ayush.pramana,
        state.ayush.satmya,
        state.ayush.sattva,
        state.ayush.ahara_shakti,
        state.ayush.vyayama_shakti,
        state.ayush.vaya,
    ]

    completed_count = sum(1 for f in fields if is_field_complete(f))
    if completed_count < 7:
        return False

    if history_length < 7:
        return False

    return True



# ============================================================================
# JSON SCHEMA HELPERS
# ============================================================================

FIELD_VALUE_SCHEMA = {
    "type": "OBJECT",

    "properties": {
        "value": {
            "type": "STRING",
            "nullable": True,
            "description": (
                "Patient information extracted from the latest answer. "
                "Use null when status is unknown, denied, "
                "or not_applicable."
            ),
        },

        "status": {
            "type": "STRING",
            "enum": [
                "answered",
                "unknown",
                "denied",
                "not_applicable",
            ],
        },
    },

    "required": [
        "value",
        "status",
    ],
}


STANDARD_SCHEMA = {
    "type": "object",

    "properties": {

        "extracted_fields": {
            "type": "object",

            "properties": {

                "chief_complaint": FIELD_VALUE_SCHEMA,

                "hpi": {
                    "type": "object",

                    "properties": {
                        "site": FIELD_VALUE_SCHEMA,
                        "onset": FIELD_VALUE_SCHEMA,
                        "character": FIELD_VALUE_SCHEMA,
                        "radiation": FIELD_VALUE_SCHEMA,
                        "associations": FIELD_VALUE_SCHEMA,
                        "timing": FIELD_VALUE_SCHEMA,
                        "aggravating_factors": FIELD_VALUE_SCHEMA,
                        "relieving_factors": FIELD_VALUE_SCHEMA,
                        "severity": FIELD_VALUE_SCHEMA,
                    },

                    "required": [
                        "site",
                        "onset",
                        "character",
                        "radiation",
                        "associations",
                        "timing",
                        "aggravating_factors",
                        "relieving_factors",
                        "severity",
                    ],
                },

                "past_medical_history": {
                    "type": "array",
                    "items": {
                        "type": "string"
                    },
                },

                "past_surgical_history": {
                    "type": "array",
                    "items": {
                        "type": "string"
                    },
                },

                "drug_allergy_history": {
                    "type": "array",
                    "items": {
                        "type": "string"
                    },
                },

                "family_history": {
                    "type": "array",
                    "items": {
                        "type": "string"
                    },
                },

                "personal_history": {
                    "type": "array",
                    "items": {
                        "type": "string"
                    },
                },

                "review_of_systems": {
                    "type": "array",
                    "items": {
                        "type": "string"
                    },
                },
            },

            "required": [
                "chief_complaint",
                "hpi",
                "past_medical_history",
                "past_surgical_history",
                "drug_allergy_history",
                "family_history",
                "personal_history",
                "review_of_systems",
            ],
        },

        "next_question": {
            "type": "string",
        },

        "suggested_options": {
            "type": "array",
            "items": {
                "type": "string"
            },
        },

        "is_complete": {
            "type": "boolean",
        },
    },

    "required": [
        "extracted_fields",
        "next_question",
        "suggested_options",
        "is_complete",
    ],
}


AYUSH_SCHEMA = {
    "type": "object",

    "properties": {

        "extracted_fields": {
            "type": "object",

            "properties": {

                "chief_complaint": FIELD_VALUE_SCHEMA,

                "ayush": {
                    "type": "object",

                    "properties": {

                        "prakriti": FIELD_VALUE_SCHEMA,
                        "vikriti": FIELD_VALUE_SCHEMA,
                        "sara": FIELD_VALUE_SCHEMA,
                        "samhanana": FIELD_VALUE_SCHEMA,
                        "pramana": FIELD_VALUE_SCHEMA,
                        "satmya": FIELD_VALUE_SCHEMA,
                        "sattva": FIELD_VALUE_SCHEMA,
                        "ahara_shakti": FIELD_VALUE_SCHEMA,
                        "vyayama_shakti": FIELD_VALUE_SCHEMA,
                        "vaya": FIELD_VALUE_SCHEMA,
                    },

                    "required": [
                        "prakriti",
                        "vikriti",
                        "sara",
                        "samhanana",
                        "pramana",
                        "satmya",
                        "sattva",
                        "ahara_shakti",
                        "vyayama_shakti",
                        "vaya",
                    ],
                },
            },

            "required": [
                "chief_complaint",
                "ayush",
            ],
        },

        "next_question": {
            "type": "string",
        },

        "suggested_options": {
            "type": "array",
            "items": {
                "type": "string"
            },
        },

        "is_complete": {
            "type": "boolean",
        },
    },

    "required": [
        "extracted_fields",
        "next_question",
        "suggested_options",
        "is_complete",
    ],
}


# ============================================================================
# SYSTEM PROMPTS
# ============================================================================

def build_standard_system_instruction(
    language: str,
) -> str:

    language_instruction = LANGUAGE_INSTRUCTIONS.get(
        language,
        f"Use simple, clear {language}.",
    )

    return f"""
You are a clinical history-taking assistant.

You are NOT a diagnostic system.

You must NOT:
- diagnose diseases
- prescribe medication
- recommend treatment
- invent symptoms
- invent patient information

Your job is limited to:
1. Collecting comprehensive patient clinical history.
2. Extracting information the patient actually provided.
3. Preserving previously known information.
4. Asking the next useful, non-repetitive history-taking question.
5. Providing short patient-friendly touch-screen answer options.

INTERVIEW SEQUENCE & MANDATORY QUESTION FLOW:

PHASE 1: History of Present Illness (HPI / SOCRATES) - First 5-6 questions:
Explore chief complaint and relevant SOCRATES parameters:
- site (where is the discomfort/pain)
- onset (when and how did it start)
- character (what does it feel like)
- radiation (does it spread anywhere)
- associations (other symptoms like fever, chills, nausea)
- timing (pattern, frequency, continuous vs intermittent)
- aggravating_factors & relieving_factors
- severity (how intense is it)

PHASE 2: Relevant Past History, Medications, Allergies & Personal Lifestyle (MANDATORY BEFORE COMPLETION):
Once chief complaint and main HPI parameters are explored, you MUST transition to Phase 2.
Systematically ask relevant questions covering:
- Past Medical & Surgical History: Long-term conditions (Diabetes, High BP, Asthma, Heart disease) or past surgeries/hospitalizations.
- Current Medications & Drug Allergies: Current daily medicines being taken, or known allergies to drugs or food.
- Family History: Running health conditions in the family (if relevant).
- Personal History & Lifestyle: Diet, physical activity, smoking, or alcohol habits.

COMPLETION RULES (CRITICAL):
- DO NOT set is_complete = true while Phase 2 (Past medical history, medications/allergies, personal lifestyle) has not been asked.
- Extract patient responses into past_medical_history, past_surgical_history, drug_allergy_history, family_history, or personal_history lists.
- If the patient denies past illnesses or allergies (e.g., "No past illness or allergies"), extract "No known chronic illnesses" / "No known allergies" into the corresponding lists.
- Set is_complete = true ONLY AFTER Phase 1 (HPI) and Phase 2 (Past/Personal History) have both been covered.

IMPORTANT QUESTIONING RULES:
- NEVER repeat a question already asked in RECENT CONVERSATION.
- Ask ONE clear, simple question at a time.
- Use simple everyday language. Do not use medical jargon (do not say "SOCRATES", "HPI", "radiation").

STATE MANAGEMENT:
Preserve previously answered information.
Do not replace an existing answered value with unknown.

LANGUAGE:
{language_instruction}

SUGGESTED OPTIONS:
Generate 3 to 6 short touch-screen options relevant to the question in the patient's language. Include an uncertainty/negative option like "None" or "No other issues".

OUTPUT:
Return ONLY the requested JSON structure. Do not return markdown outside JSON.
"""


def build_ayush_system_instruction(
    language: str,
) -> str:

    language_instruction = LANGUAGE_INSTRUCTIONS.get(
        language,
        f"Use simple, clear {language}.",
    )

    return f"""
You are a clinical history-taking assistant supporting an Ayurvedic OPD assessment.

You are NOT a diagnostic system.

You must NOT:
- diagnose disease
- prescribe treatment
- claim that an Ayurvedic assessment proves a medical diagnosis
- invent patient information

Your job is limited to:
1. Collecting Ayurvedic patient history across Dashavidha Pariksha.
2. Extracting information the patient actually provided.
3. Preserving previously known information.
4. Asking the next appropriate, non-repetitive assessment question.
5. Generating simple touch-screen answer options.

INTERVIEW PARAMETERS (DASHAVIDHA PARIKSHA):
1. Vikriti: Current discomfort & dosha imbalance symptoms.
2. Prakriti: Baseline thermal preference (heat vs cold sensitivity, sweating).
3. Ahara Shakti: Appetite, digestion speed, meal tolerance.
4. Satmya: Habitual diet, routines, food sensitivities.
5. Sattva: Mental resilience, sleep quality, stress response.
6. Vyayama Shakti & Samhanana: Physical stamina, body build, fatigue level.
7. Vaya: Age / lifecycle stage.

CRITICAL QUESTIONING RULES:
- NEVER repeat the exact same question (e.g., if age or any parameter was asked, DO NOT ask it again).
- Move dynamically to the next parameter with status 'unknown'.
- NEVER use Sanskrit terminology directly with the patient (e.g. ask "Do you feel hot or cold easily?" instead of "What is your Prakriti?").

LANGUAGE:
{language_instruction}

SUGGESTED OPTIONS:
Generate 3 to 6 short touch-screen options matching the question in patient's language.

OUTPUT:
Return ONLY the requested JSON structure.
"""


# ============================================================================
# USER PROMPT
# ============================================================================

def build_user_prompt(
    current_extracted_state: Dict[str, Any],
    recent_conversation: List[Dict[str, Any]],
    latest_user_answer: str,
    language: str,
    mode: str,
    patient_profile: Optional[Dict[str, Any]] = None,
) -> str:

    profile = patient_profile or {}

    return f"""
CURRENT INTERVIEW MODE:
{mode}

PATIENT LANGUAGE:
{language}

PATIENT PROFILE / KNOWN DATA:
{json.dumps(profile, ensure_ascii=False, indent=2)}

CURRENT EXTRACTED STATE:
{json.dumps(current_extracted_state, ensure_ascii=False, indent=2)}

RECENT CONVERSATION:
{json.dumps(recent_conversation, ensure_ascii=False, indent=2)}

LATEST PATIENT ANSWER:
{json.dumps(latest_user_answer, ensure_ascii=False)}

TASK:

1. Extract any new information from the latest patient answer.
2. Preserve all previously valid information.
3. Update only information supported by the patient's answer.
4. Decide the single most useful next history-taking question.
5. Generate 3 to 6 short patient-friendly answer options.
6. Set is_complete appropriately.
7. Do not diagnose.
8. Do not recommend treatment.
9. Do not invent patient information.

The latest answer may answer the question indirectly.

For example, if asked:
"Where is the pain?"

and the patient says:
"It starts around my forehead."

extract:

site = "forehead"

Do not require the patient to use exactly the same words as the question.
"""


# ============================================================================
# GENERATION CONFIG
# ============================================================================

def build_generation_config(
    schema: Dict[str, Any],
    model_name: str,
) -> Dict[str, Any]:
    """
    Build Gemini REST generation configuration.

    The REST API supports structured JSON output through generationConfig.
    """

    config: Dict[str, Any] = {
        "temperature": 0.2,

        "responseMimeType": "application/json",

        "responseSchema": schema,
    }

    # Gemini 2.5 supports thinking configuration.
    #
    # Keep this conservative because the task is structured extraction,
    # not long-form reasoning.
    if model_name.startswith("gemini-2.5"):
        config["thinkingConfig"] = {
            "thinkingBudget": 512,
        }

    return config


# ============================================================================
# RETRY HELPERS
# ============================================================================

def parse_retry_after(
    response: requests.Response,
) -> float:

    value = response.headers.get(
        "Retry-After"
    )

    if not value:
        return 0.0

    try:
        return max(
            0.0,
            float(value),
        )

    except ValueError:
        return 0.0


def calculate_backoff(
    attempt: int,
) -> float:

    return min(
        8.0,
        2 ** attempt,
    )


# ============================================================================
# RESPONSE EXTRACTION
# ============================================================================

def extract_response_text(
    data: Dict[str, Any],
) -> Optional[str]:
    """
    Extract generated text from Gemini generateContent response.
    """

    candidates = data.get(
        "candidates",
        [],
    )

    if not candidates:
        return None

    candidate = candidates[0]

    content = candidate.get(
        "content",
        {},
    )

    parts = content.get(
        "parts",
        [],
    )

    text_parts: List[str] = []

    for part in parts:

        if not isinstance(part, dict):
            continue

        text_value = part.get(
            "text"
        )

        if isinstance(
            text_value,
            str,
        ):
            text_parts.append(
                text_value
            )

    if not text_parts:
        return None

    return "".join(
        text_parts
    ).strip()


# ============================================================================
# OPTIONS
# ============================================================================

def normalize_suggested_options(
    options: Any,
    language: str,
) -> List[str]:

    if not isinstance(
        options,
        list,
    ):
        options = []

    cleaned: List[str] = []

    for option in options:

        if not isinstance(
            option,
            str,
        ):
            continue

        option = option.strip()

        if not option:
            continue

        if option.lower() not in {
            existing.lower()
            for existing in cleaned
        }:
            cleaned.append(option)

    cleaned = cleaned[:6]

    if language == "hi":

        not_sure = "पक्का नहीं"

        none_of_above = "इनमें से कोई नहीं"

    elif language == "te":

        not_sure = "ఖచ్చితంగా తెలియదు"

        none_of_above = "వీటిలో ఏదీ కాదు"

    else:

        not_sure = "Not sure"

        none_of_above = "None of the above"

    if len(cleaned) < 3:

        if not any(
            option.lower() == not_sure.lower()
            for option in cleaned
        ):
            cleaned.append(
                not_sure
            )

    if len(cleaned) < 3:

        if not any(
            option.lower() == none_of_above.lower()
            for option in cleaned
        ):
            cleaned.append(
                none_of_above
            )

    if not cleaned:

        cleaned = [
            "Yes",
            "No",
            not_sure,
        ]

    return cleaned[:6]


# ============================================================================
# RESPONSE VALIDATION
# ============================================================================

def validate_model_response(
    raw_json: Dict[str, Any],
    mode: str,
    language: str,
) -> Tuple[InterviewResponse, Any]:

    response = InterviewResponse.model_validate(
        raw_json
    )

    response.suggested_options = (
        normalize_suggested_options(
            response.suggested_options,
            language,
        )
    )

    # During an incomplete interview, Gemini should normally provide
    # a question. During a complete interview, the application will
    # remove it later.
    if not isinstance(
        response.next_question,
        str,
    ):
        raise ValueError(
            "next_question must be a string."
        )

    if mode == "standard":

        extracted = (
            StandardExtractedFields.model_validate(
                response.extracted_fields
            )
        )

    else:

        extracted = (
            AyushExtractedFields.model_validate(
                response.extracted_fields
            )
        )

    return response, extracted


# ============================================================================
# HTTP REQUEST
# ============================================================================

def request_gemini(
    *,
    model_name: str,
    system_instruction: str,
    user_prompt: str,
    schema: Dict[str, Any],
) -> Tuple[
    Optional[Dict[str, Any]],
    Optional[int],
    Optional[str],
]:
    """
    Send one Gemini generateContent request.

    Returns:
        parsed_json
        HTTP status
        error category
    """

    api_key = get_gemini_api_key()

    if not api_key:

        logger.error(
            "Gemini API key is missing."
        )

        return (
            None,
            None,
            "authentication",
        )

    url = (
        f"{GEMINI_BASE_URL}/"
        f"{model_name}:generateContent"
    )

    headers = {
        "Content-Type": "application/json",
        "x-goog-api-key": api_key,
    }

    generation_config = (
        build_generation_config(
            schema=schema,
            model_name=model_name,
        )
    )

    payload = {
        "systemInstruction": {
            "parts": [
                {
                    "text": system_instruction
                }
            ]
        },

        "contents": [
            {
                "role": "user",

                "parts": [
                    {
                        "text": user_prompt
                    }
                ],
            }
        ],

        "generationConfig": generation_config,
    }

    for attempt in range(
        MAX_TRANSIENT_RETRIES + 1
    ):

        try:

            response = requests.post(
                url,
                json=payload,
                headers=headers,
                timeout=DEFAULT_TIMEOUT_SECONDS,
            )

        except requests.Timeout:

            logger.warning(
                "Gemini timeout on %s "
                "(attempt %s)",
                model_name,
                attempt + 1,
            )

            if attempt < MAX_TRANSIENT_RETRIES:

                time.sleep(
                    calculate_backoff(
                        attempt
                    )
                )

                continue

            return (
                None,
                None,
                "timeout",
            )

        except requests.RequestException as exc:

            logger.warning(
                "Gemini network error on %s: %s",
                model_name,
                exc,
            )

            if attempt < MAX_TRANSIENT_RETRIES:

                time.sleep(
                    calculate_backoff(
                        attempt
                    )
                )

                continue

            return (
                None,
                None,
                "network",
            )

        status = response.status_code

        # --------------------------------------------------------------------
        # SUCCESS
        # --------------------------------------------------------------------

        if status == 200:

            try:

                data = response.json()

            except ValueError:

                logger.error(
                    "Gemini returned invalid HTTP JSON."
                )

                return (
                    None,
                    status,
                    "invalid_response",
                )

            text_content = (
                extract_response_text(
                    data
                )
            )

            if not text_content:

                logger.error(
                    "Gemini response contained "
                    "no usable text."
                )

                logger.debug(
                    "Gemini response: %s",
                    json.dumps(
                        data,
                        ensure_ascii=False,
                    )[:3000],
                )

                return (
                    None,
                    status,
                    "invalid_response",
                )

            try:

                parsed = json.loads(
                    text_content
                )

                if not isinstance(
                    parsed,
                    dict,
                ):
                    raise ValueError(
                        "Gemini JSON root is not an object."
                    )

                return (
                    parsed,
                    status,
                    None,
                )

            except (
                json.JSONDecodeError,
                ValueError,
            ) as exc:

                logger.error(
                    "Gemini returned invalid JSON: %s",
                    exc,
                )

                logger.debug(
                    "Raw Gemini text: %s",
                    text_content[:3000],
                )

                return (
                    None,
                    status,
                    "invalid_response",
                )

        # --------------------------------------------------------------------
        # RATE LIMIT
        # --------------------------------------------------------------------

        if status == 429:

            retry_after = (
                parse_retry_after(
                    response
                )
            )

            delay = (
                retry_after
                if retry_after > 0
                else calculate_backoff(
                    attempt
                )
            )

            logger.warning(
                "Gemini rate limited %s. "
                "Waiting %.2fs.",
                model_name,
                delay,
            )

            if attempt < MAX_TRANSIENT_RETRIES:

                time.sleep(delay)

                continue

            return (
                None,
                status,
                "rate_limit",
            )

        # --------------------------------------------------------------------
        # TEMPORARY SERVER ERRORS
        # --------------------------------------------------------------------

        if status in {
            500,
            502,
            503,
            504,
        }:

            logger.warning(
                "Gemini server error %s on %s.",
                status,
                model_name,
            )

            if attempt < MAX_TRANSIENT_RETRIES:

                time.sleep(
                    calculate_backoff(
                        attempt
                    )
                )

                continue

            return (
                None,
                status,
                "server_error",
            )

        # --------------------------------------------------------------------
        # MODEL NOT FOUND
        # --------------------------------------------------------------------

        if status == 404:

            logger.warning(
                "Gemini model not found: %s",
                model_name,
            )

            return (
                None,
                status,
                "not_found",
            )

        # --------------------------------------------------------------------
        # AUTHENTICATION
        # --------------------------------------------------------------------

        if status in {
            401,
            403,
        }:

            logger.error(
                "Gemini authentication/authorization "
                "failed: HTTP %s.",
                status,
            )

            return (
                None,
                status,
                "authentication",
            )

        # --------------------------------------------------------------------
        # BAD REQUEST
        # --------------------------------------------------------------------

        if status == 400:

            logger.error(
                "Gemini rejected request with HTTP 400: %s",
                response.text[:3000],
            )

            return (
                None,
                status,
                "bad_request",
            )

        # --------------------------------------------------------------------
        # OTHER
        # --------------------------------------------------------------------

        logger.error(
            "Unexpected Gemini HTTP status %s: %s",
            status,
            response.text[:1000],
        )

        return (
            None,
            status,
            "bad_request",
        )

    return (
        None,
        None,
        "network",
    )


# ============================================================================
# REPAIR REQUEST
# ============================================================================

def repair_invalid_response(
    *,
    model_name: str,
    mode: str,
    language: str,
    raw_response: Dict[str, Any],
    schema: Dict[str, Any],
) -> Optional[Dict[str, Any]]:
    """
    Perform one controlled structural repair attempt.
    """

    repair_system = f"""
You are a JSON validation assistant.

Your task is ONLY to repair the supplied clinical interview response.

Mode:
{mode}

Language:
{language}

Rules:

- Do not add patient information.
- Do not diagnose.
- Do not prescribe treatment.
- Do not invent symptoms.
- Do not remove valid patient information.
- Ensure the output matches the supplied JSON schema.
- Ensure all required fields exist.
- Ensure status values are:
  answered
  unknown
  denied
  not_applicable
- Ensure next_question is a string.
- Ensure suggested_options is an array of strings.
- Return JSON only.
"""

    repair_prompt = f"""
INVALID / INCOMPLETE RESPONSE:

{json.dumps(
    raw_response,
    ensure_ascii=False,
    indent=2,
)}

Repair this object so that it follows the required schema.

Do not change the clinical meaning.
"""

    parsed, _, error = request_gemini(
        model_name=model_name,
        system_instruction=repair_system,
        user_prompt=repair_prompt,
        schema=schema,
    )

    if error is not None:
        return None

    return parsed


# ============================================================================
# MAIN CLINICAL INTERVIEW FUNCTION
# ============================================================================

def call_gemini_clinical_interview(
    conversation_history: List[Dict[str, Any]],
    current_extracted_state: Dict[str, Any],
    latest_user_answer: str,
    language: str = "en",
    mode: str = "standard",
    patient_profile: Optional[Dict[str, Any]] = None,
) -> Optional[Dict[str, Any]]:
    """
    Main clinical interview entry point.

    Returns:

        {
            "extracted_fields": {...},
            "next_question": "...",
            "suggested_options": [...],
            "is_complete": false
        }

    Returns None if the Gemini engine cannot produce a valid response.
    """

    # ------------------------------------------------------------------------
    # BASIC VALIDATION
    # ------------------------------------------------------------------------

    if not isinstance(
        latest_user_answer,
        str,
    ):

        logger.error(
            "latest_user_answer must be a string."
        )

        return None

    latest_user_answer = (
        latest_user_answer.strip()
    )

    if not latest_user_answer:

        logger.error(
            "latest_user_answer is empty."
        )

        return None

    mode = (
        mode.lower()
        .strip()
    )

    if mode not in VALID_MODES:

        logger.error(
            "Invalid mode '%s'.",
            mode,
        )

        return None

    language = (
        language.lower()
        .strip()
    )

    # ------------------------------------------------------------------------
    # RECENT HISTORY
    # ------------------------------------------------------------------------

    if not isinstance(
        conversation_history,
        list,
    ):
        conversation_history = []

    recent_conversation = (
        conversation_history[
            -RECENT_HISTORY_LIMIT:
        ]
    )

    # ------------------------------------------------------------------------
    # SELECT MODE
    # ------------------------------------------------------------------------

    if mode == "standard":

        system_instruction = (
            build_standard_system_instruction(
                language
            )
        )

        schema = STANDARD_SCHEMA

        try:

            previous_state = (
                StandardExtractedFields.model_validate(
                    current_extracted_state
                )
            )

        except ValidationError as exc:

            logger.warning(
                "Existing standard state invalid. "
                "Starting clean state. Error: %s",
                exc,
            )

            previous_state = (
                StandardExtractedFields()
            )

    else:

        system_instruction = (
            build_ayush_system_instruction(
                language
            )
        )

        schema = AYUSH_SCHEMA

        try:

            previous_state = (
                AyushExtractedFields.model_validate(
                    current_extracted_state
                )
            )

        except ValidationError as exc:

            logger.warning(
                "Existing AYUSH state invalid. "
                "Starting clean state. Error: %s",
                exc,
            )

            previous_state = (
                AyushExtractedFields()
            )

    # ------------------------------------------------------------------------
    # USER PROMPT
    # ------------------------------------------------------------------------

    user_prompt = build_user_prompt(
        current_extracted_state=(
            previous_state.model_dump()
        ),

        recent_conversation=(
            recent_conversation
        ),

        latest_user_answer=(
            latest_user_answer
        ),

        language=language,

        mode=mode,

        patient_profile=(
            patient_profile
        ),
    )

    # ------------------------------------------------------------------------
    # MODEL LOOP
    # ------------------------------------------------------------------------

    for model_name in MODELS_TO_TRY:

        logger.info(
            "Trying Gemini model: %s",
            model_name,
        )

        raw_json, status_code, error = (
            request_gemini(
                model_name=model_name,
                system_instruction=(
                    system_instruction
                ),
                user_prompt=user_prompt,
                schema=schema,
            )
        )

        # --------------------------------------------------------------------
        # SUCCESSFUL HTTP RESPONSE
        # --------------------------------------------------------------------

        if raw_json is not None:

            try:

                response, new_state = (
                    validate_model_response(
                        raw_json=raw_json,
                        mode=mode,
                        language=language,
                    )
                )

            except ValidationError as exc:

                logger.warning(
                    "Pydantic validation failed "
                    "for %s: %s",
                    model_name,
                    exc,
                )

                repaired = (
                    repair_invalid_response(
                        model_name=model_name,
                        mode=mode,
                        language=language,
                        raw_response=raw_json,
                        schema=schema,
                    )
                )

                if repaired is None:

                    continue

                try:

                    response, new_state = (
                        validate_model_response(
                            raw_json=repaired,
                            mode=mode,
                            language=language,
                        )
                    )

                except ValidationError as repair_exc:

                    logger.error(
                        "Repair response still invalid: %s",
                        repair_exc,
                    )

                    continue

            except ValueError as exc:

                logger.warning(
                    "Gemini response validation failed: %s",
                    exc,
                )

                continue

            # ----------------------------------------------------------------
            # MERGE STATE
            # ----------------------------------------------------------------

            if mode == "standard":

                merged_state = (
                    merge_standard_state(
                        previous=previous_state,
                        new=new_state,
                    )
                )

                complete = (
                    standard_state_is_complete(
                        merged_state,
                        history_length=len(recent_conversation)
                    )
                )

            else:

                merged_state = (
                    merge_ayush_state(
                        previous=previous_state,
                        new=new_state,
                    )
                )

                complete = (
                    ayush_state_is_complete(
                        merged_state,
                        history_length=len(recent_conversation)
                    )
                )

            # ----------------------------------------------------------------
            # APPLICATION-LEVEL COMPLETION
            # ----------------------------------------------------------------

            response.is_complete = complete

            if complete:

                response.next_question = ""

                response.suggested_options = []

            # ----------------------------------------------------------------
            # RETURN
            # ----------------------------------------------------------------

            return {
                "extracted_fields": (
                    merged_state.model_dump(
                        exclude_none=False
                    )
                ),

                "next_question": (
                    response.next_question
                ),

                "suggested_options": (
                    response.suggested_options
                ),

                "is_complete": (
                    response.is_complete
                ),
            }

        # --------------------------------------------------------------------
        # ERROR / FALLBACK
        # --------------------------------------------------------------------

        if error == "authentication":

            logger.error(
                "Gemini authentication failed."
            )

            # Another model cannot repair a bad API key.
            return None

        if error == "bad_request":

            logger.error(
                "Gemini rejected the request."
            )

            # The schema/payload itself is likely invalid.
            return None

        if error == "rate_limit":

            logger.warning(
                "Model %s was rate limited. "
                "Trying fallback model.",
                model_name,
            )

            continue

        if error in {
            "server_error",
            "timeout",
            "network",
            "not_found",
            "invalid_response",
        }:

            logger.warning(
                "Falling back after %s from model %s.",
                error,
                model_name,
            )

            continue

    logger.error(
        "All Gemini models failed."
    )

    return None


# ============================================================================
# BACKWARD-COMPATIBLE WRAPPER
# ============================================================================

def call_gemini_amie_reasoning(
    conversation_history: list,
    current_extracted_state: dict,
    latest_user_answer: str,
    language: str = "en",
    mode: str = "standard",
) -> Optional[Dict[str, Any]]:
    """
    Backward-compatible wrapper.

    Existing callers can continue using:

        call_gemini_amie_reasoning(...)
    """

    return call_gemini_clinical_interview(
        conversation_history=conversation_history,
        current_extracted_state=current_extracted_state,
        latest_user_answer=latest_user_answer,
        language=language,
        mode=mode,
        patient_profile=None,
    )


# ============================================================================
# SIMPLE LOCAL TEST
# ============================================================================

if __name__ == "__main__":

    initial_state = {
        "chief_complaint": {
            "value": None,
            "status": "unknown",
        },

        "hpi": {
            "site": {
                "value": None,
                "status": "unknown",
            },

            "onset": {
                "value": None,
                "status": "unknown",
            },

            "character": {
                "value": None,
                "status": "unknown",
            },

            "radiation": {
                "value": None,
                "status": "unknown",
            },

            "associations": {
                "value": None,
                "status": "unknown",
            },

            "timing": {
                "value": None,
                "status": "unknown",
            },

            "aggravating_factors": {
                "value": None,
                "status": "unknown",
            },

            "relieving_factors": {
                "value": None,
                "status": "unknown",
            },

            "severity": {
                "value": None,
                "status": "unknown",
            },
        },

        "past_medical_history": [],
        "past_surgical_history": [],
        "drug_allergy_history": [],
        "family_history": [],
        "personal_history": [],
        "review_of_systems": [],
    }

    result = call_gemini_clinical_interview(
        conversation_history=[],

        current_extracted_state=initial_state,

        latest_user_answer=(
            "I have been having a headache "
            "for two days."
        ),

        language="en",

        mode="standard",

        patient_profile={
            "age": 20,
        },
    )

    print(
        json.dumps(
            result,
            indent=2,
            ensure_ascii=False,
        )
    )