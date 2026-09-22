"""
Bhashini ULCA / Dhruva API Client for ASR and TTS.
--------------------------------------------------
Provides live integration with Ministry of Electronics & IT (MeitY) Bhashini AI services.

Endpoints used:
1. Dynamic Service Negotiation:
   https://meity-auth.ulcacontrib.org/ulca/apis/v0/model/getModelsPipeline
2. Direct Dhruva Inference:
   https://dhruva-api.bhashini.gov.in/services/inference/pipeline
"""

import os
import requests
import logging
from typing import Optional, Dict, Any
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger(__name__)

# Bhashini Config Endpoints & Defaults
BHASHINI_CONFIG_URL = "https://meity-auth.ulcacontrib.org/ulca/apis/v0/model/getModelsPipeline"
BHASHINI_INFERENCE_URL = "https://dhruva-api.bhashini.gov.in/services/inference/pipeline"
DEFAULT_PIPELINE_ID = "64392f96daac500b55c543cd"

# Service ID Cache to avoid redundant config network roundtrips
_SERVICE_CACHE: Dict[str, str] = {}

# Fallback Indic Service IDs if dynamic negotiation is slow or offline
FALLBACK_SERVICES = {
    "asr": {
        "hi": "ai4bharat/conformer-hi-gpu--t4",
        "en": "ai4bharat/whisper-medium-en--gpu--t4",
        "te": "ai4bharat/conformer-multilingual-dravidian-gpu--t4",
        "ta": "ai4bharat/conformer-multilingual-dravidian-gpu--t4",
        "kn": "ai4bharat/conformer-multilingual-dravidian-gpu--t4",
        "ml": "ai4bharat/conformer-multilingual-dravidian-gpu--t4",
        "mr": "ai4bharat/conformer-hi-gpu--t4",
        "bn": "ai4bharat/conformer-multilingual-indo_aryan-gpu--t4",
        "gu": "ai4bharat/conformer-multilingual-indo_aryan-gpu--t4",
    },
    "tts": {
        "hi": "ai4bharat/indic-tts-coqui-indo_aryan-gpu--t4",
        "en": "ai4bharat/indic-tts-coqui-misc-gpu--t4",
        "te": "ai4bharat/indic-tts-coqui-dravidian-gpu--t4",
        "ta": "ai4bharat/indic-tts-coqui-dravidian-gpu--t4",
        "kn": "ai4bharat/indic-tts-coqui-dravidian-gpu--t4",
        "ml": "ai4bharat/indic-tts-coqui-dravidian-gpu--t4",
        "mr": "ai4bharat/indic-tts-coqui-indo_aryan-gpu--t4",
        "bn": "ai4bharat/indic-tts-coqui-indo_aryan-gpu--t4",
        "gu": "ai4bharat/indic-tts-coqui-indo_aryan-gpu--t4",
    }
}


def _get_credentials():
    user_id = os.getenv("BHASHINI_USER_ID", "").strip()
    api_key = os.getenv("BHASHINI_API_KEY", "").strip()
    pipeline_id = os.getenv("BHASHINI_PIPELINE_ID", "").strip() or DEFAULT_PIPELINE_ID
    return user_id, api_key, pipeline_id


def get_service_id(task_type: str, language: str = "hi") -> str:
    """
    Dynamically fetches or returns cached service ID for a task (asr/tts) and language.
    """
    cache_key = f"{task_type}:{language}"
    if cache_key in _SERVICE_CACHE:
        return _SERVICE_CACHE[cache_key]

    user_id, api_key, pipeline_id = _get_credentials()
    if not api_key:
        return FALLBACK_SERVICES.get(task_type, {}).get(language, "")

    headers = {
        "userID": user_id,
        "Authorization": api_key,
        "Content-Type": "application/json"
    }

    # Bhashini pipeline config payload
    payload = {
        "pipelineTasks": [
            {
                "taskType": "asr",
                "config": {"language": {"sourceLanguage": language if task_type == "asr" else "hi"}}
            },
            {
                "taskType": "translation",
                "config": {"language": {"sourceLanguage": "hi", "targetLanguage": "en"}}
            },
            {
                "taskType": "tts",
                "config": {"language": {"sourceLanguage": language if task_type == "tts" else "hi"}}
            }
        ],
        "pipelineRequestConfig": {
            "pipelineId": pipeline_id
        }
    }

    try:
        res = requests.post(BHASHINI_CONFIG_URL, json=payload, headers=headers, timeout=5)
        if res.status_code == 200:
            resp_data = res.json()
            for task in resp_data.get("pipelineResponseConfig", []):
                if task.get("taskType") == task_type:
                    configs = task.get("config", [])
                    if configs:
                        sid = configs[0].get("serviceId")
                        if sid:
                            _SERVICE_CACHE[cache_key] = sid
                            return sid
    except Exception as e:
        logger.warning(f"Bhashini config lookup failed for {task_type}/{language}: {e}")

    # Fallback to static mapping
    fallback_sid = FALLBACK_SERVICES.get(task_type, {}).get(language, "")
    _SERVICE_CACHE[cache_key] = fallback_sid
    return fallback_sid


def synthesize_speech(text: str, language: str = "hi", gender: str = "female") -> Optional[str]:
    """
    Synthesizes speech from text using Bhashini TTS.
    Returns base64-encoded WAV audio string, or None if failed.
    """
    if not text or not text.strip():
        return None

    user_id, api_key, _ = _get_credentials()
    if not api_key:
        logger.error("BHASHINI_API_KEY missing in environment.")
        return None

    service_id = get_service_id("tts", language)

    headers = {
        "Content-Type": "application/json",
        "Authorization": api_key
    }
    if user_id:
        headers["userID"] = user_id

    tts_payload = {
        "pipelineTasks": [
            {
                "taskType": "tts",
                "config": {
                    "language": {
                        "sourceLanguage": language
                    },
                    "serviceId": service_id,
                    "gender": gender
                }
            }
        ],
        "inputData": {
            "input": [
                {
                    "source": text
                }
            ]
        }
    }

    try:
        res = requests.post(BHASHINI_INFERENCE_URL, json=tts_payload, headers=headers, timeout=15)
        if res.status_code == 200:
            resp_json = res.json()
            audio_b64 = resp_json["pipelineResponse"][0]["audio"][0]["audioContent"]
            return audio_b64
        else:
            logger.error(f"Bhashini TTS API error {res.status_code}: {res.text}")
    except Exception as e:
        logger.error(f"Bhashini TTS Exception: {e}")

    return None


def transcribe_audio(audio_base64: str, language: str = "hi", audio_format: str = "wav", sampling_rate: int = 22050) -> Optional[str]:
    """
    Transcribes audio to text using Bhashini ASR.
    Returns transcribed text string, or None if failed.
    """
    if not audio_base64 or not audio_base64.strip():
        return None

    # Detect format from data URL header if present (e.g., data:audio/webm;base64,...)
    if audio_base64.startswith("data:"):
        header, audio_base64 = audio_base64.split(",", 1)
        if "webm" in header:
            audio_format = "webm"
        elif "mp4" in header or "m4a" in header:
            audio_format = "mp4"
        elif "ogg" in header:
            audio_format = "ogg"
        elif "wav" in header:
            audio_format = "wav"
    elif "," in audio_base64:
        audio_base64 = audio_base64.split(",", 1)[1]

    user_id, api_key, _ = _get_credentials()
    if not api_key:
        logger.error("BHASHINI_API_KEY missing in environment.")
        return None

    service_id = get_service_id("asr", language)

    headers = {
        "Content-Type": "application/json",
        "Authorization": api_key
    }
    if user_id:
        headers["userID"] = user_id

    asr_payload = {
        "pipelineTasks": [
            {
                "taskType": "asr",
                "config": {
                    "language": {
                        "sourceLanguage": language
                    },
                    "serviceId": service_id,
                    "audioFormat": audio_format,
                    "samplingRate": sampling_rate
                }
            }
        ],
        "inputData": {
            "audio": [
                {
                    "audioContent": audio_base64
                }
            ]
        }
    }

    try:
        res = requests.post(BHASHINI_INFERENCE_URL, json=asr_payload, headers=headers, timeout=15)
        if res.status_code == 200:
            resp_json = res.json()
            transcribed_text = resp_json["pipelineResponse"][0]["output"][0]["source"]
            return transcribed_text
        else:
            logger.error(f"Bhashini ASR API error {res.status_code}: {res.text}")
    except Exception as e:
        logger.error(f"Bhashini ASR Exception: {e}")

    return None
