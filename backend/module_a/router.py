"""
API Router for Module A
-----------------------
Exposes the clinical interview engine through FastAPI endpoints.

Connects:
    React frontend
        ↓
    FastAPI router
        ↓
    conversation.py
        ↓
    gemini_client.py
        ↓
    Gemini API
"""

from typing import Dict, Any, List, Optional, Literal

from fastapi import APIRouter, HTTPException, Path
from pydantic import BaseModel, Field, ConfigDict

from .conversation import (
    process_turn,
    get_session_state,
    get_session_history,
    clear_session,
)
from common.bhashini_client import transcribe_audio as bhashini_asr, synthesize_speech as bhashini_tts



# ---------------------------------------------------------------------------
# Router setup
# ---------------------------------------------------------------------------

router = APIRouter(
    prefix="",
    tags=["Module A - Interview Engine"],
)


# ---------------------------------------------------------------------------
# Shared types
# ---------------------------------------------------------------------------

InterviewMode = Literal["standard", "ayush"]
InterviewLanguage = Literal["en", "hi", "te"]


# ---------------------------------------------------------------------------
# Request models
# ---------------------------------------------------------------------------

class InterviewTurnRequest(BaseModel):
    """
    Request body sent by the React frontend for every patient response.
    """

    model_config = ConfigDict(
        str_strip_whitespace=True,
        extra="ignore",
    )

    patient_id: str = Field(
        ...,
        min_length=1,
        max_length=100,
        description="Unique identifier for the active patient session.",
    )

    user_answer: Optional[str] = Field(
        default="",
        description="The patient's latest answer.",
    )

    patient_answer_text: Optional[str] = Field(
        default="",
        description="Alias for user_answer sent by React frontend.",
    )

    patient_audio_base64: Optional[str] = Field(
        default=None,
        description="Optional base64 encoded audio string.",
    )

    mode: InterviewMode = Field(
        default="standard",
        description="Interview mode.",
    )

    language: InterviewLanguage = Field(
        default="en",
        description="Language used for the interview.",
    )

    patient_profile: Optional[Dict[str, Any]] = Field(
        default=None,
        description="Optional patient information already known.",
    )


# ---------------------------------------------------------------------------
# Response models
# ---------------------------------------------------------------------------

class InterviewTurnResponse(BaseModel):
    """
    Response returned after processing one patient answer.
    Supports both internal naming and React frontend expected properties.
    """

    error: bool

    message: Optional[str] = None

    extracted_fields: Optional[Dict[str, Any]] = None

    next_question: str = ""
    next_question_text: str = ""
    next_question_audio: Optional[str] = None

    suggested_options: List[str] = Field(default_factory=list)
    next_question_options: List[str] = Field(default_factory=list)

    is_complete: bool = False
    conversation_complete: bool = False

    # Red-flag information
    red_flag: bool = False
    red_flag_detected: bool = False
    red_flag_reason: Optional[str] = None
    red_flag_details: Optional[Dict[str, Any]] = None


class PatientStateResponse(BaseModel):
    """
    Response containing the current extracted clinical state.
    """

    patient_id: str
    extracted_fields: Dict[str, Any]


class ConversationMessage(BaseModel):
    """
    One message in the interview history.
    """

    role: str
    text: str


class PatientHistoryResponse(BaseModel):
    """
    Response containing the patient's conversation history.
    """

    patient_id: str
    history: List[ConversationMessage]


class SessionDeleteResponse(BaseModel):
    """
    Response returned after successfully deleting a session.
    """

    message: str


# ---------------------------------------------------------------------------
# POST /turn
# ---------------------------------------------------------------------------

@router.post(
    "/turn",
    response_model=InterviewTurnResponse,
    summary="Process one interview turn",
)
async def handle_interview_turn(
    payload: InterviewTurnRequest,
) -> InterviewTurnResponse:
    """
    Process one patient response.
    """

    answer = (payload.user_answer or payload.patient_answer_text or "").strip()

    # 0. Bhashini ASR: If audio base64 is provided and answer text is empty, transcribe audio
    if not answer and payload.patient_audio_base64:
        try:
            transcribed = bhashini_asr(payload.patient_audio_base64, language=payload.language)
            if transcribed:
                answer = transcribed.strip()
        except Exception as e:
            print(f"Bhashini ASR transcription failed: {e}")

    # 1. Handle initial call on component mount (empty answer)
    if not answer:
        initial_q = {
            "standard": {
                "en": "What problem brings you to the hospital today?",
                "hi": "आज आपको अस्पताल में क्या परेशानी लेकर आई है?",
                "te": "ఈ రోజు మిమ్మల్ని ఆసుపత్రికి తీసుకువచ్చిన సమస్య ఏమిటి?",
            },
            "ayush": {
                "en": "What specific discomfort brings you for Ayurvedic consultation today?",
                "hi": "आज आपको स्वास्थ्य में क्या असंतुलन या समस्या महसूस हो रही है?",
                "te": "ఈ రోజు మీకు ఆరోగ్యంలో ఏ రకమైన ఇబ్బంది అనిపిస్తుంది?",
            }
        }
        initial_opts = {
            "standard": {
                "en": ["Joint Pain", "Fever & Bodyache", "Stomach Pain", "Cough & Cold"],
                "hi": ["घुटने/जोड़ों में दर्द", "बुखार और बदन दर्द", "पेट में दर्द", "खांसी और जुकाम"],
                "te": ["కీళ్ల నొప్పులు", "జ్వరం మరియు ఒంటి నొప్పులు", "కడుపు నొప్పి", "దగ్గు మరియు జలుబు"],
            },
            "ayush": {
                "en": ["Prakriti: Heat Sensitive", "Ahara: Poor Digestion", "Vikriti: Gas & Bloating", "Sattva: High Stress"],
                "hi": ["गर्मी ज्यादा लगना", "पाचन कमजोर", "गैस / एसिडिटी", "मानसिक तनाव"],
                "te": ["వేడి తట్టుకోలేకపోవడం", "జీర్ణశక్తి తక్కువ", "గ్యాస్ / అసిడిటీ", "మానసిక ఒత్తిడి"],
            }
        }
        q_text = initial_q.get(payload.mode, {}).get(payload.language) or initial_q["standard"]["en"]
        opts = initial_opts.get(payload.mode, {}).get(payload.language) or initial_opts["standard"]["en"]

        # Synthesize TTS audio for initial question
        q_audio = None
        try:
            q_audio = bhashini_tts(q_text, language=payload.language)
        except Exception:
            pass

        return InterviewTurnResponse(
            error=False,
            message=None,
            extracted_fields=None,
            next_question=q_text,
            next_question_text=q_text,
            next_question_audio=q_audio,
            suggested_options=opts,
            next_question_options=opts,
            is_complete=False,
            conversation_complete=False,
            red_flag=False,
            red_flag_detected=False,
            red_flag_reason=None,
            red_flag_details=None,
        )

    try:

        result = process_turn(
            patient_id=payload.patient_id,
            user_answer=answer,
            mode=payload.mode,
            language=payload.language,
            patient_profile=payload.patient_profile,
        )

    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"An unexpected error occurred while processing the interview: {str(exc)}",
        )

    if result.get("error"):

        return InterviewTurnResponse(
            error=True,
            message=result.get(
                "message",
                "The interview could not be processed.",
            ),
            extracted_fields=None,
            next_question="",
            next_question_text="",
            next_question_audio=None,
            suggested_options=[],
            next_question_options=[],
            is_complete=False,
            conversation_complete=False,
        )

    nq = result.get("next_question", "")
    opts = result.get("suggested_options", [])
    rf = bool(result.get("red_flag", False))
    rf_det = result.get("red_flag_details")
    rf_reason = rf_det.get("message") if isinstance(rf_det, dict) else None

    # Synthesize TTS audio for next question
    nq_audio = None
    if nq:
        try:
            nq_audio = bhashini_tts(nq, language=payload.language)
        except Exception:
            pass

    return InterviewTurnResponse(
        error=False,
        message=None,
        extracted_fields=result.get("extracted_fields"),
        next_question=nq,
        next_question_text=nq,
        next_question_audio=nq_audio,
        suggested_options=opts,
        next_question_options=opts,
        is_complete=bool(result.get("is_complete", False)),
        conversation_complete=bool(result.get("is_complete", False)),
        red_flag=rf,
        red_flag_detected=rf,
        red_flag_reason=rf_reason,
        red_flag_details=rf_det,
    )


# Helper schemas and endpoints for direct TTS and ASR calls
class TTSRequest(BaseModel):
    text: str
    language: str = "hi"


class ASRRequest(BaseModel):
    audio_base64: str
    language: str = "hi"


@router.post("/tts", summary="Synthesize speech with Bhashini TTS")
async def handle_tts(payload: TTSRequest):
    audio_b64 = bhashini_tts(payload.text, language=payload.language)
    if not audio_b64:
        raise HTTPException(status_code=500, detail="Bhashini TTS synthesis failed.")
    return {"audio_base64": audio_b64, "language": payload.language}


@router.post("/asr", summary="Transcribe audio with Bhashini ASR")
async def handle_asr(payload: ASRRequest):
    transcribed = bhashini_asr(payload.audio_base64, language=payload.language)
    if not transcribed:
        raise HTTPException(status_code=500, detail="Bhashini ASR transcription failed.")
    return {"transcribed_text": transcribed, "language": payload.language}



# ---------------------------------------------------------------------------
# GET /state/{patient_id}
# ---------------------------------------------------------------------------

@router.get(
    "/state/{patient_id}",
    response_model=PatientStateResponse,
    summary="Get current clinical state",
)
async def get_patient_state(
    patient_id: str = Path(
        ...,
        min_length=1,
        max_length=100,
        description="Patient/session identifier.",
        examples=["patient_12345"],
    ),
) -> PatientStateResponse:
    """
    Retrieve the current extracted clinical state.

    Useful when:
    - React refreshes
    - the UI needs to rehydrate
    - another frontend component needs the current state
    """

    state = get_session_state(patient_id)

    if state is None:

        raise HTTPException(
            status_code=404,
            detail="Active session not found for this patient.",
        )

    return PatientStateResponse(
        patient_id=patient_id,
        extracted_fields=state,
    )


# ---------------------------------------------------------------------------
# GET /history/{patient_id}
# ---------------------------------------------------------------------------

@router.get(
    "/history/{patient_id}",
    response_model=PatientHistoryResponse,
    summary="Get interview conversation history",
)
async def get_patient_history(
    patient_id: str = Path(
        ...,
        min_length=1,
        max_length=100,
        description="Patient/session identifier.",
        examples=["patient_12345"],
    ),
) -> PatientHistoryResponse:
    """
    Retrieve the patient's conversation history.

    Example:

        [
            {
                "role": "patient",
                "text": "I have a headache."
            },
            {
                "role": "assistant",
                "text": "Where exactly is the pain?"
            }
        ]
    """

    history = get_session_history(patient_id)

    if history is None:

        raise HTTPException(
            status_code=404,
            detail="Active session not found for this patient.",
        )

    return PatientHistoryResponse(
        patient_id=patient_id,
        history=history,
    )


# ---------------------------------------------------------------------------
# DELETE /session/{patient_id}
# ---------------------------------------------------------------------------

@router.delete(
    "/session/{patient_id}",
    response_model=SessionDeleteResponse,
    summary="End patient interview session",
)
async def end_patient_session(
    patient_id: str = Path(
        ...,
        min_length=1,
        max_length=100,
        description="Patient/session identifier.",
        examples=["patient_12345"],
    ),
) -> SessionDeleteResponse:
    """
    Delete the patient's active in-memory session.

    This should normally be called when:
    - the interview has been completed and saved elsewhere
    - the patient cancels the interview
    - the frontend explicitly starts a fresh interview
    """

    deleted = clear_session(patient_id)

    if not deleted:

        raise HTTPException(
            status_code=404,
            detail="Active session not found for this patient.",
        )

    return SessionDeleteResponse(
        message=f"Session for {patient_id} successfully cleared."
    )