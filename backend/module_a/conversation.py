"""
Conversation & State Manager
----------------------------
Manages in-memory patient sessions, conversation history,
and delegates clinical interview processing to gemini_client.py.

This file is designed to work with the existing gemini_client.py
without requiring changes to its state structure.
"""

from .red_flag_detector import detect_red_flags

from typing import Dict, Any, Optional
from copy import deepcopy
from threading import Lock

from .gemini_client import call_gemini_clinical_interview


# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

VALID_MODES = {"standard", "ayush"}
VALID_LANGUAGES = {"en", "hi", "te"}

# Prevent unnecessarily large conversation histories.
# gemini_client.py also limits the history sent to Gemini.
MAX_HISTORY_MESSAGES = 20


# ---------------------------------------------------------------------------
# In-memory session store
# ---------------------------------------------------------------------------
#
# Structure:
#
# {
#     patient_id: {
#         "mode": "standard",
#         "language": "en",
#         "history": [],
#         "state": {...},
#         "patient_profile": {...},
#         "red_flag_detected": False,
#         "red_flag_reason": None
#     }
# }
#
# This is suitable for development/prototyping.
# For production, use Redis or a database.
# ---------------------------------------------------------------------------

active_sessions: Dict[str, Dict[str, Any]] = {}

# Protects the in-memory session dictionary if multiple requests
# arrive at approximately the same time.
session_lock = Lock()


# ---------------------------------------------------------------------------
# State helpers
# ---------------------------------------------------------------------------

def get_blank_field() -> Dict[str, Any]:
    """
    Creates a blank structured field compatible with gemini_client.py.

    A field can have one of these statuses:
        answered
        unknown
        denied
        not_applicable
    """

    return {
        "value": None,
        "status": "unknown"
    }


def generate_initial_state(mode: str) -> Dict[str, Any]:
    """
    Generates the initial extracted state for an interview.

    IMPORTANT:
    The structure here intentionally matches the state structure
    expected by the existing gemini_client.py.
    """

    mode = mode.lower().strip()

    if mode == "standard":

        return {
            "chief_complaint": get_blank_field(),

            "hpi": {
                "site": get_blank_field(),
                "onset": get_blank_field(),
                "character": get_blank_field(),
                "radiation": get_blank_field(),
                "associations": get_blank_field(),
                "timing": get_blank_field(),
                "aggravating_factors": get_blank_field(),
                "relieving_factors": get_blank_field(),
                "severity": get_blank_field(),
            },

            # Keep these as plain lists.
            # This is intentional because the existing gemini_client.py
            # expects this structure.
            "past_medical_history": [],
            "past_surgical_history": [],
            "drug_allergy_history": [],
            "family_history": [],
            "personal_history": [],
            "review_of_systems": [],
        }

    elif mode == "ayush":

        return {
            "chief_complaint": get_blank_field(),

            "ayush": {
                "prakriti": get_blank_field(),
                "vikriti": get_blank_field(),
                "sara": get_blank_field(),
                "samhanana": get_blank_field(),
                "pramana": get_blank_field(),
                "satmya": get_blank_field(),
                "sattva": get_blank_field(),
                "ahara_shakti": get_blank_field(),
                "vyayama_shakti": get_blank_field(),
                "vaya": get_blank_field(),
            }
        }

    raise ValueError(
        f"Invalid interview mode: '{mode}'. "
        f"Expected 'standard' or 'ayush'."
    )


# ---------------------------------------------------------------------------
# Session creation / retrieval
# ---------------------------------------------------------------------------

def get_or_create_session(
    patient_id: str,
    mode: str,
    language: str,
    patient_profile: Optional[Dict[str, Any]] = None
) -> Dict[str, Any]:
    """
    Retrieves an existing patient session or creates a new one.

    If the interview mode changes, the previous interview is reset because
    Standard and AYUSH use different extracted-state structures.

    Patient profile information is stored separately from the extracted
    interview state.
    """

    if not patient_id or not patient_id.strip():
        raise ValueError("patient_id cannot be empty.")

    patient_id = patient_id.strip()

    mode = mode.lower().strip()
    language = language.lower().strip()

    if mode not in VALID_MODES:
        raise ValueError(
            f"Invalid mode '{mode}'. "
            f"Expected one of: {sorted(VALID_MODES)}"
        )

    if language not in VALID_LANGUAGES:
        raise ValueError(
            f"Invalid language '{language}'. "
            f"Expected one of: {sorted(VALID_LANGUAGES)}"
        )

    with session_lock:

        # ---------------------------------------------------------------
        # Create new session
        # ---------------------------------------------------------------

        if patient_id not in active_sessions:

            active_sessions[patient_id] = {
                "mode": mode,
                "language": language,
                "history": [],
                "state": generate_initial_state(mode),
                "patient_profile": deepcopy(patient_profile or {}),

                # Red-flag state
                "red_flag_detected": False,
                "red_flag_reason": None,
            }

        else:

            session = active_sessions[patient_id]

            # -----------------------------------------------------------
            # If mode changes, reset the interview.
            # -----------------------------------------------------------

            if session["mode"] != mode:

                active_sessions[patient_id] = {
                    "mode": mode,
                    "language": language,
                    "history": [],
                    "state": generate_initial_state(mode),
                    "patient_profile": deepcopy(patient_profile or {}),

                    # Reset red-flag state for the new interview
                    "red_flag_detected": False,
                    "red_flag_reason": None,
                }

            else:

                # -------------------------------------------------------
                # Language can change without destroying the interview.
                # -------------------------------------------------------

                session["language"] = language

                # Only replace profile when one is explicitly supplied.
                if patient_profile is not None:
                    session["patient_profile"] = deepcopy(
                        patient_profile
                    )

                # -------------------------------------------------------
                # Backward compatibility for sessions created before
                # red-flag fields were added.
                # -------------------------------------------------------

                if "red_flag_detected" not in session:
                    session["red_flag_detected"] = False

                if "red_flag_reason" not in session:
                    session["red_flag_reason"] = None

        return active_sessions[patient_id]


# ---------------------------------------------------------------------------
# History management
# ---------------------------------------------------------------------------

def append_history(
    session: Dict[str, Any],
    role: str,
    text: str
) -> None:
    """
    Adds one message to the patient's conversation history.

    Valid roles:
        patient
        assistant

    The history is capped to avoid unnecessary memory growth.
    """

    if not text or not text.strip():
        return

    if role not in {"patient", "assistant"}:
        raise ValueError(
            "role must be either 'patient' or 'assistant'."
        )

    session["history"].append({
        "role": role,
        "text": text.strip()
    })

    # Keep only the most recent messages.
    if len(session["history"]) > MAX_HISTORY_MESSAGES:
        session["history"] = session["history"][
            -MAX_HISTORY_MESSAGES:
        ]


# ---------------------------------------------------------------------------
# Main conversation processor
# ---------------------------------------------------------------------------

def process_turn(
    patient_id: str,
    user_answer: str,
    mode: str = "standard",
    language: str = "en",
    patient_profile: Optional[Dict[str, Any]] = None
) -> Dict[str, Any]:
    """
    Processes one patient response.

    Flow:

        React frontend
             ↓
        process_turn()
             ↓
        Get/create session
             ↓
        Red-flag safety check
             ↓
        Gemini clinical interview engine
             ↓
        Update extracted state
             ↓
        Update conversation history
             ↓
        Return JSON-compatible response
    """

    # -----------------------------------------------------------------------
    # Validate patient ID
    # -----------------------------------------------------------------------

    if not patient_id or not patient_id.strip():

        return {
            "error": True,
            "message": "A valid patient ID is required.",
            "next_question": "",
            "suggested_options": [],
            "is_complete": False,
            "red_flag": False,
            "red_flag_details": None,
        }

    # -----------------------------------------------------------------------
    # Validate patient answer
    # -----------------------------------------------------------------------

    if not user_answer or not user_answer.strip():

        return {
            "error": True,
            "message": "Please provide an answer before continuing.",
            "next_question": "",
            "suggested_options": [],
            "is_complete": False,
            "red_flag": False,
            "red_flag_details": None,
        }

    # -----------------------------------------------------------------------
    # Get/create patient session
    # -----------------------------------------------------------------------

    try:

        session = get_or_create_session(
            patient_id=patient_id,
            mode=mode,
            language=language,
            patient_profile=patient_profile
        )

    except ValueError as exc:

        return {
            "error": True,
            "message": str(exc),
            "next_question": "",
            "suggested_options": [],
            "is_complete": False,
            "red_flag": False,
            "red_flag_details": None,
        }

    # -----------------------------------------------------------------------
    # RED FLAG CHECK
    # -----------------------------------------------------------------------
    #
    # IMPORTANT:
    #
    # This check happens BEFORE Gemini.
    #
    # Therefore a possible emergency does not depend on:
    #     - Gemini availability
    #     - Gemini reasoning
    #     - Gemini response formatting
    #     - Gemini model selection
    #
    # If a red flag is detected, normal automated questioning stops.
    # -----------------------------------------------------------------------

    red_flag_result = detect_red_flags(
        text=user_answer,
        language=language
    )

    if red_flag_result["red_flag"]:

        # ---------------------------------------------------------------
        # Persist red-flag status in the patient session.
        # ---------------------------------------------------------------

        session["red_flag_detected"] = True

        # Store the actual matched signals when available.
        session["red_flag_reason"] = (
            red_flag_result.get("matched_signals")
            or red_flag_result.get("message")
            or "Potential emergency symptoms detected."
        )

        # ---------------------------------------------------------------
        # Preserve the patient's answer.
        # ---------------------------------------------------------------

        append_history(
            session=session,
            role="patient",
            text=user_answer
        )

        # ---------------------------------------------------------------
        # IMPORTANT:
        #
        # Do NOT call Gemini for another routine question.
        #
        # The frontend/triage system should now handle the alert.
        # ---------------------------------------------------------------

        return {
            "error": False,
            "extracted_fields": session["state"],
            "next_question": "",
            "suggested_options": [],
            "is_complete": True,

            # Red-flag information
            "red_flag": True,
            "red_flag_details": red_flag_result,
        }

    # -----------------------------------------------------------------------
    # Call the existing Gemini clinical interview engine
    # -----------------------------------------------------------------------

    try:

        result = call_gemini_clinical_interview(
            conversation_history=session["history"],
            current_extracted_state=session["state"],
            latest_user_answer=user_answer.strip(),
            language=session["language"],
            mode=session["mode"],
            patient_profile=session.get("patient_profile")
        )

    except Exception:
        # Do not expose internal Gemini/API errors to the frontend.
        #
        # gemini_client.py already handles the expected API failures,
        # retries, fallbacks, and validation. This is a final safety net
        # so one unexpected exception does not crash the API request.

        return {
            "error": True,
            "message": (
                "The clinical engine is currently unavailable. "
                "Please try again."
            ),
            "next_question": "",
            "suggested_options": [],
            "is_complete": False,
            "red_flag": False,
            "red_flag_details": None,
        }

    # -----------------------------------------------------------------------
    # Handle Gemini failure
    # -----------------------------------------------------------------------

    if not result:

        return {
            "error": True,
            "message": (
                "The clinical engine is currently unavailable. "
                "Please try again."
            ),
            "next_question": "",
            "suggested_options": [],
            "is_complete": False,
            "red_flag": False,
            "red_flag_details": None,
        }

    # -----------------------------------------------------------------------
    # Update extracted state
    # -----------------------------------------------------------------------

    if "extracted_fields" in result:
        session["state"] = result["extracted_fields"]

    # -----------------------------------------------------------------------
    # Store patient's latest answer
    # -----------------------------------------------------------------------

    append_history(
        session=session,
        role="patient",
        text=user_answer
    )

    # -----------------------------------------------------------------------
    # Read Gemini's response
    # -----------------------------------------------------------------------

    next_question = result.get("next_question", "")
    suggested_options = result.get("suggested_options", [])
    is_complete = bool(result.get("is_complete", False))

    # -----------------------------------------------------------------------
    # Store assistant's next question
    # -----------------------------------------------------------------------

    if not is_complete and next_question:

        append_history(
            session=session,
            role="assistant",
            text=next_question
        )

    # -----------------------------------------------------------------------
    # Return frontend payload
    # -----------------------------------------------------------------------

    return {
        "error": False,
        "extracted_fields": session["state"],
        "next_question": next_question,
        "suggested_options": suggested_options,
        "is_complete": is_complete,

        # Normal interview = no red flag
        "red_flag": False,
        "red_flag_details": None,
    }


# ---------------------------------------------------------------------------
# Session access
# ---------------------------------------------------------------------------

def get_session(
    patient_id: str
) -> Optional[Dict[str, Any]]:
    """
    Returns a copy of the patient's active session.

    A deep copy is returned so external code cannot accidentally modify
    the actual session stored in active_sessions.
    """

    if not patient_id:
        return None

    with session_lock:

        session = active_sessions.get(patient_id)

        if session is None:
            return None

        # Backward compatibility for sessions created before the
        # red-flag fields existed.
        if "red_flag_detected" not in session:
            session["red_flag_detected"] = False

        if "red_flag_reason" not in session:
            session["red_flag_reason"] = None

        return deepcopy(session)


def get_session_state(
    patient_id: str
) -> Optional[Dict[str, Any]]:
    """
    Returns only the patient's current extracted clinical state.
    """

    session = get_session(patient_id)

    if session is None:
        return None

    return session.get("state")


def get_session_history(
    patient_id: str
) -> Optional[list]:
    """
    Returns a copy of the patient's conversation history.
    """

    session = get_session(patient_id)

    if session is None:
        return None

    return session.get("history", [])


# ---------------------------------------------------------------------------
# Session status
# ---------------------------------------------------------------------------

def session_exists(
    patient_id: str
) -> bool:
    """
    Checks whether an active session exists for a patient.
    """

    if not patient_id:
        return False

    with session_lock:
        return patient_id in active_sessions


# ---------------------------------------------------------------------------
# Session deletion
# ---------------------------------------------------------------------------

def clear_session(
    patient_id: str
) -> bool:
    """
    Deletes a patient's active session.

    Returns:
        True  -> session existed and was deleted
        False -> no session existed
    """

    if not patient_id:
        return False

    with session_lock:

        if patient_id in active_sessions:

            del active_sessions[patient_id]

            return True

    return False


# ---------------------------------------------------------------------------
# Clear all sessions
# ---------------------------------------------------------------------------

def clear_all_sessions() -> None:
    """
    Clears every active in-memory session.

    Useful during development/testing.

    Do NOT expose this as an unrestricted public API endpoint.
    """

    with session_lock:
        active_sessions.clear()


# ---------------------------------------------------------------------------
# Backward compatibility for Module C
# ---------------------------------------------------------------------------

def _extract_field_value(field: Any) -> Any:
    """
    Converts the structured FieldValue used by gemini_client.py
    into the plain value expected by older modules such as Module C.

    Example:

        {
            "value": "forehead",
            "status": "answered"
        }

    becomes:

        "forehead"

    Lists and already-plain values are returned unchanged.
    """

    if isinstance(field, dict):

        if "value" in field:
            return field.get("value")

    return field


def _flatten_module_a_state(
    state: Dict[str, Any]
) -> Dict[str, Any]:
    """
    Converts Module A's internal structured state into the simpler
    representation expected by Module C.

    This does NOT modify the actual session state.
    """

    if not isinstance(state, dict):
        return {}

    output: Dict[str, Any] = {}

    # -----------------------------------------------------------------------
    # Chief complaint
    # -----------------------------------------------------------------------

    output["chief_complaint"] = _extract_field_value(
        state.get("chief_complaint")
    )

    # -----------------------------------------------------------------------
    # HPI
    # -----------------------------------------------------------------------

    hpi = state.get("hpi", {})

    if isinstance(hpi, dict):

        output["hpi"] = {
            key: _extract_field_value(value)
            for key, value in hpi.items()
        }

    else:

        output["hpi"] = {}

    # -----------------------------------------------------------------------
    # Standard history fields
    # -----------------------------------------------------------------------

    for field_name in [
        "past_medical_history",
        "past_surgical_history",
        "drug_allergy_history",
        "family_history",
        "personal_history",
        "review_of_systems",
    ]:

        value = state.get(field_name, [])

        if value is None:
            value = []

        # Normally these are already lists.
        # This also protects Module C if something unexpected comes back.
        if isinstance(value, list):

            output[field_name] = value

        else:

            output[field_name] = [value]

    # -----------------------------------------------------------------------
    # AYUSH
    # -----------------------------------------------------------------------

    ayush = state.get("ayush", {})

    if isinstance(ayush, dict):

        output["ayush"] = {
            key: _extract_field_value(value)
            for key, value in ayush.items()
        }

    else:

        output["ayush"] = {}

    return output


def get_output(
    patient_id: str
) -> Optional[Dict[str, Any]]:
    """
    Backward-compatible interface used by Module C.

    Module C expects a simple Module A output object, while the current
    conversation manager stores a richer structured state internally.

    This function converts the internal state into Module C's expected
    format without changing the actual session state.
    """

    session = get_session(patient_id)

    if session is None:
        return None

    state = session.get("state", {})

    output = _flatten_module_a_state(state)

    # -----------------------------------------------------------------------
    # Metadata
    # -----------------------------------------------------------------------

    output["patient_id"] = patient_id
    output["language"] = session.get("language", "en")

    # -----------------------------------------------------------------------
    # Red-flag information
    # -----------------------------------------------------------------------

    output["red_flag_detected"] = bool(
        session.get("red_flag_detected", False)
    )

    output["red_flag_reason"] = session.get(
        "red_flag_reason"
    )

    return output