"""
Red Flag Detection Engine
-------------------------
Deterministic safety layer for Module A.

Purpose:
    Detect potentially life-threatening symptoms BEFORE/ALONGSIDE
    the Gemini clinical interview engine.

Important:
    This module does NOT diagnose a medical condition.

    It identifies symptom patterns that warrant immediate human
    clinical/triage attention.

Design goals:
    - Independent of Gemini
    - Fast
    - Deterministic
    - Multilingual support for English, Hindi and Telugu
    - Conservative toward obvious emergency patterns
    - Easy to extend later
"""

import re
import unicodedata
from typing import Any, Dict, List


# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

# India uses 112 as the unified emergency response number.
# Keep this configurable so the application can be deployed elsewhere.
EMERGENCY_NUMBER = "112"


# ---------------------------------------------------------------------------
# Text normalization
# ---------------------------------------------------------------------------

def normalize_text(text: str) -> str:
    """
    Normalizes user input for rule matching.

    This does NOT translate the text.
    It only:
        - converts to lowercase
        - normalizes Unicode
        - removes unnecessary punctuation
        - normalizes whitespace
    """

    if not text:
        return ""

    text = unicodedata.normalize("NFKC", text)

    text = text.lower().strip()

    # Convert punctuation to spaces.
    text = re.sub(r"[^\w\s]", " ", text, flags=re.UNICODE)

    # Collapse repeated whitespace.
    text = re.sub(r"\s+", " ", text)

    return text


# ---------------------------------------------------------------------------
# Negation detection
# ---------------------------------------------------------------------------

NEGATION_TERMS = {
    # English
    "no",
    "not",
    "never",
    "without",
    "dont",
    "don't",
    "doesnt",
    "doesn't",
    "didnt",
    "didn't",

    # Hindi
    "नहीं",
    "नही",
    "न",
    "बिना",

    # Telugu
    "లేదు",
    "లేదని",
    "కాదు",
}


def is_negated(
    text: str,
    match_start: int,
    window: int = 45
) -> bool:
    """
    Performs a simple local negation check.

    Example:

        "I have chest pain"
            -> False

        "I do not have chest pain"
            -> True

    This is intentionally conservative and local.
    It is not intended to replace a full clinical NLP parser.
    """

    start = max(0, match_start - window)

    preceding_text = text[start:match_start]

    words = preceding_text.split()

    # Check the most recent few words.
    recent_words = words[-6:]

    for word in recent_words:

        cleaned = word.strip()

        if cleaned in NEGATION_TERMS:
            return True

    return False


# ---------------------------------------------------------------------------
# Pattern helper
# ---------------------------------------------------------------------------

def find_positive_patterns(
    text: str,
    patterns: List[str]
) -> List[str]:
    """
    Returns the matching pattern descriptions while ignoring
    locally negated mentions.
    """

    matches = []

    for pattern in patterns:

        match = re.search(
            pattern,
            text,
            flags=re.IGNORECASE | re.UNICODE
        )

        if not match:
            continue

        if is_negated(text, match.start()):
            continue

        matches.append(pattern)

    return matches


# ---------------------------------------------------------------------------
# Emergency pattern definitions
# ---------------------------------------------------------------------------

# ---------------------------------------------------------------------------
# Stroke-like symptoms
# ---------------------------------------------------------------------------
#
# CDC/NHS describe sudden:
#   - facial weakness/droop
#   - arm/leg weakness or numbness, especially one-sided
#   - speech difficulty/confusion
#   - vision problems
#   - balance/dizziness problems
#   - sudden severe headache
#
# These are warning signs, not a diagnosis.
# ---------------------------------------------------------------------------

STROKE_PATTERNS = [
    # English
    r"\bone side\b.*\b(weak|weakness|numb|numbness)\b",
    r"\b(one[- ]sided|unilateral)\b.*\b(weak|weakness|numb|numbness)\b",
    r"\bface\b.*\b(droop|drooping|weakness|numb)\b",
    r"\bslurred speech\b",
    r"\b(cannot|can't|unable to|difficulty)\b.*\bspeak\b",
    r"\b(cannot|can't|unable to|difficulty)\b.*\bunderstand\b",
    r"\bsudden\b.*\b(vision loss|loss of vision|blurred vision)\b",
    r"\bsudden\b.*\b(severe headache|worst headache)\b",
    r"\bsudden\b.*\b(loss of balance|balance problem|difficulty walking)\b",

    # Hindi
    r"एक तरफ.*(कमजोरी|सुन्न)",
    r"(चेहरा|मुंह).*(टेढ़ा|झुक)",
    r"(बोलने|बोलने में).*(दिक्कत|परेशानी)",
    r"(अचानक).*(तेज सिरदर्द|बहुत तेज सिरदर्द)",
    r"(अचानक).*(दृष्टि|दिखाई).*(कम|बंद|धुंधली)",

    # Telugu
    r"ఒక వైపు.*(బలహీనత|తిమ్మిరి)",
    r"(ముఖం).*(వంకర|వాలడం)",
    r"(మాట్లాడ).*?(ఇబ్బంది|కష్టం)",
    r"(అకస్మాత్తుగా).*(తీవ్రమైన తలనొప్పి)",
    r"(అకస్మాత్తుగా).*(చూపు|దృష్టి).*(తగ్గ|కనిపించ)",
]


# ---------------------------------------------------------------------------
# Chest / cardiac / breathing emergencies
# ---------------------------------------------------------------------------

CHEST_PAIN_PATTERNS = [
    # English
    r"\bchest pain\b",
    r"\bchest pressure\b",
    r"\bpressure in (my|the) chest\b",
    r"\btightness in (my|the) chest\b",
    r"\bcrushing (chest )?pain\b",
    r"\bsevere chest pain\b",

    # Hindi
    r"सीने में दर्द",
    r"सीने में दबाव",
    r"सीने में जकड़न",

    # Telugu
    r"ఛాతిలో నొప్పి",
    r"ఛాతి నొప్పి",
    r"ఛాతిలో ఒత్తిడి",
    r"ఛాతిలో బిగుతు",
]


BREATHING_EMERGENCY_PATTERNS = [
    # English
    r"\bsevere(ly)?\s+(short of breath|breathless)\b",
    r"\bsevere difficulty breathing\b",
    r"\bcan't breathe\b",
    r"\bcannot breathe\b",
    r"\bstruggling to breathe\b",
    r"\bgasping for breath\b",
    r"\bchoking\b",
    r"\bnot able to get words out\b",

    # Hindi
    r"सांस लेने में बहुत (दिक्कत|परेशानी)",
    r"सांस नहीं ले पा रहा",
    r"सांस नहीं ले पा रही",
    r"सांस लेने में कठिनाई",

    # Telugu
    r"శ్వాస తీసుకోవడంలో.*(తీవ్రమైన|చాలా).*?(ఇబ్బంది|కష్టం)",
    r"శ్వాస తీసుకోలేక",
    r"ఊపిరి తీసుకోలేక",
]


# ---------------------------------------------------------------------------
# Consciousness / collapse
# ---------------------------------------------------------------------------

CONSCIOUSNESS_PATTERNS = [
    # English
    r"\bunconscious\b",
    r"\bpassed out\b",
    r"\bpassed out and\b",
    r"\blost consciousness\b",
    r"\bnot responding\b",
    r"\bunresponsive\b",
    r"\bcollapsed\b",
    r"\bfainted\b",

    # Hindi
    r"बेहोश",
    r"होश नहीं",
    r"जवाब नहीं दे",
    r"अचानक गिर",

    # Telugu
    r"స్పృహ కోల్పోయ",
    r"స్పృహ లేదు",
    r"స్పందించడం లేదు",
    r"అపస్మారక",
]


# ---------------------------------------------------------------------------
# Severe bleeding
# ---------------------------------------------------------------------------

SEVERE_BLEEDING_PATTERNS = [
    # English
    r"\buncontrolled bleeding\b",
    r"\bsevere bleeding\b",
    r"\bbleeding won't stop\b",
    r"\bblood won't stop\b",
    r"\bprofuse bleeding\b",

    # Hindi
    r"बहुत ज्यादा खून",
    r"खून नहीं रुक",
    r"बहुत अधिक रक्तस्राव",
    r"रक्तस्राव नहीं रुक",

    # Telugu
    r"చాలా ఎక్కువ రక్తస్రావం",
    r"రక్తస్రావం ఆగడం లేదు",
    r"రక్తం ఆగడం లేదు",
]


# ---------------------------------------------------------------------------
# Seizure / convulsion
# ---------------------------------------------------------------------------

SEIZURE_PATTERNS = [
    # English
    r"\bseizure\b",
    r"\bconvulsion\b",
    r"\bconvulsions\b",
    r"\bfit\b.*\b(not stopping|won't stop|continues)\b",
    r"\bseizure\b.*\b(not stopping|won't stop|continuous)\b",

    # Hindi
    r"दौरा.*(नहीं रुक|लगातार)",
    r"मिर्गी का दौरा.*(नहीं रुक|लगातार)",

    # Telugu
    r"మూర్ఛ.*(ఆగడం లేదు|కొనసాగ)",
    r"ఫిట్స్.*(ఆగడం లేదు|కొనసాగ)",
]


# ---------------------------------------------------------------------------
# Severe allergic reaction / anaphylaxis-like pattern
# ---------------------------------------------------------------------------

ALLERGIC_EMERGENCY_PATTERNS = [
    # English
    r"\b(anaphylaxis|anaphylactic)\b",
    r"\bsevere allergic reaction\b",
    r"\bthroat swelling\b.*\b(breath|breathing)\b",
    r"\btongue swelling\b.*\b(breath|breathing)\b",
    r"\blip swelling\b.*\b(breath|breathing)\b",

    # Hindi
    r"गंभीर एलर्जी.*सांस",
    r"गला.*सूज.*सांस",
    r"जीभ.*सूज.*सांस",

    # Telugu
    r"తీవ్రమైన అలర్జీ.*శ్వాస",
    r"గొంతు.*వాపు.*శ్వాస",
    r"నాలుక.*వాపు.*శ్వాస",
]


# ---------------------------------------------------------------------------
# Poisoning / overdose
# ---------------------------------------------------------------------------

POISONING_PATTERNS = [
    # English
    r"\boverdose\b",
    r"\bpoisoned\b",
    r"\bpoisoning\b",
    r"\bswallowed poison\b",
    r"\bdrank poison\b",
    r"\btook too many (tablets|pills|medicines)\b",

    # Hindi
    r"जहर.*खा",
    r"जहर.*पी",
    r"जहर.*निगल",
    r"दवा.*ज्यादा.*खा",
    r"दवाइयां.*ज्यादा.*खा",

    # Telugu
    r"విషం.*తాగ",
    r"విషం.*తిన్న",
    r"మందులు.*ఎక్కువగా.*తీసుకున్న",
]


# ---------------------------------------------------------------------------
# Main detector
# ---------------------------------------------------------------------------

def detect_red_flags(
    text: str,
    language: str = "en"
) -> Dict[str, Any]:
    """
    Detects potentially dangerous symptom patterns.

    Returns a stable JSON-compatible object.

    Example:

        {
            "red_flag": True,
            "priority": "emergency",
            "categories": ["chest_pain", "breathing_difficulty"],
            "matched_signals": [
                "chest pain",
                "severe difficulty breathing"
            ],
            "message": "...",
            "action": "..."
        }

    IMPORTANT:
        red_flag=True means:
            "This input contains a symptom pattern that should receive
             immediate human/triage attention."

        It does NOT mean:
            "The patient definitely has a particular disease."
    """

    normalized = normalize_text(text)

    if not normalized:

        return {
            "red_flag": False,
            "priority": "routine",
            "categories": [],
            "matched_signals": [],
            "message": "",
            "action": "",
        }

    categories: List[str] = []
    matched_signals: List[str] = []

    # -----------------------------------------------------------------------
    # Stroke
    # -----------------------------------------------------------------------

    stroke_matches = find_positive_patterns(
        normalized,
        STROKE_PATTERNS
    )

    if stroke_matches:

        categories.append("stroke_like_symptoms")

        matched_signals.append(
            "possible sudden neurological warning signs"
        )

    # -----------------------------------------------------------------------
    # Chest pain
    # -----------------------------------------------------------------------

    chest_matches = find_positive_patterns(
        normalized,
        CHEST_PAIN_PATTERNS
    )

    if chest_matches:

        categories.append("chest_pain")

        matched_signals.append(
            "chest pain or chest pressure"
        )

    # -----------------------------------------------------------------------
    # Severe breathing difficulty
    # -----------------------------------------------------------------------

    breathing_matches = find_positive_patterns(
        normalized,
        BREATHING_EMERGENCY_PATTERNS
    )

    if breathing_matches:

        categories.append("breathing_difficulty")

        matched_signals.append(
            "severe breathing difficulty"
        )

    # -----------------------------------------------------------------------
    # Consciousness
    # -----------------------------------------------------------------------

    consciousness_matches = find_positive_patterns(
        normalized,
        CONSCIOUSNESS_PATTERNS
    )

    if consciousness_matches:

        categories.append("loss_of_consciousness")

        matched_signals.append(
            "loss of consciousness or unresponsiveness"
        )

    # -----------------------------------------------------------------------
    # Severe bleeding
    # -----------------------------------------------------------------------

    bleeding_matches = find_positive_patterns(
        normalized,
        SEVERE_BLEEDING_PATTERNS
    )

    if bleeding_matches:

        categories.append("severe_bleeding")

        matched_signals.append(
            "severe or uncontrolled bleeding"
        )

    # -----------------------------------------------------------------------
    # Seizure
    # -----------------------------------------------------------------------

    seizure_matches = find_positive_patterns(
        normalized,
        SEIZURE_PATTERNS
    )

    if seizure_matches:

        categories.append("ongoing_seizure")

        matched_signals.append(
            "possible ongoing seizure/convulsion"
        )

    # -----------------------------------------------------------------------
    # Severe allergic reaction
    # -----------------------------------------------------------------------

    allergy_matches = find_positive_patterns(
        normalized,
        ALLERGIC_EMERGENCY_PATTERNS
    )

    if allergy_matches:

        categories.append("severe_allergic_reaction")

        matched_signals.append(
            "possible severe allergic reaction with airway involvement"
        )

    # -----------------------------------------------------------------------
    # Poisoning / overdose
    # -----------------------------------------------------------------------

    poisoning_matches = find_positive_patterns(
        normalized,
        POISONING_PATTERNS
    )

    if poisoning_matches:

        categories.append("poisoning_or_overdose")

        matched_signals.append(
            "possible poisoning or medication overdose"
        )

    # -----------------------------------------------------------------------
    # No red flag
    # -----------------------------------------------------------------------

    if not categories:

        return {
            "red_flag": False,
            "priority": "routine",
            "categories": [],
            "matched_signals": [],
            "message": "",
            "action": "",
        }

    # -----------------------------------------------------------------------
    # Emergency response
    # -----------------------------------------------------------------------

    return {
        "red_flag": True,
        "priority": "emergency",
        "categories": categories,
        "matched_signals": matched_signals,

        "message": (
            "Possible emergency symptoms detected. "
            "The interview should be stopped and the case reviewed "
            "immediately by clinical/triage staff."
        ),

        "action": (
            f"Alert clinical/triage staff immediately. "
            f"If this is an actual emergency, use the local emergency "
            f"medical service (India: {EMERGENCY_NUMBER})."
        ),
    }


# ---------------------------------------------------------------------------
# Convenience function
# ---------------------------------------------------------------------------

def has_red_flag(
    text: str,
    language: str = "en"
) -> bool:
    """
    Simple boolean helper.
    """

    return bool(
        detect_red_flags(
            text=text,
            language=language
        )["red_flag"]
    )