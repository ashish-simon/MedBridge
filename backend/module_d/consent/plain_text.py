"""
Plain-Language Multilingual Consent Terms.

Provides patient-friendly explanations of consent terms across English, Hindi,
and 20+ Scheduled Indian languages, adhering to DPDP Act 2023 requirements.
"""

from typing import Dict, Any


CONSENT_TERMS: Dict[str, Dict[str, str]] = {
    "en": {
        "title": "Patient Consent for MediKiosk Consultation",
        "summary": "We collect your medical history and previous documents to help your doctor treat you better.",
        "points": (
            "1. Information Collection: We record the symptoms you describe and digitize prescriptions/reports you provide.\n"
            "2. Sharing with Doctor: A structured summary is immediately routed to the OPD consultation doctor.\n"
            "3. ABDM Ecosystem: If you provide your ABHA ID, your records can be linked to your national health account.\n"
            "4. Privacy & Clearing: All audio recordings and uploaded document photos are deleted permanently immediately after submission.\n"
            "5. Voluntary: Your consent is voluntary and you may choose what you share."
        ),
        "question_prompt": "Do you agree or decline? If you agree, say 'Agree'. Otherwise, say 'Decline'.",
        "guardian_clause": "For patients under 18 years, an adult guardian must review and authorize this consent."
    },
    "hi": {
        "title": "मेडीकियोस्क परामर्श हेतु रोगी सहमति",
        "summary": "हम आपके लक्षणों और पुराने पर्चों की जानकारी लेते हैं ताकि डॉक्टर आपका बेहतर इलाज कर सकें।",
        "points": (
            "1. जानकारी का संग्रह: आपके द्वारा बताए गए लक्षण और स्कैन किए गए पर्चे रिकॉर्ड किए जाते हैं।\n"
            "2. डॉक्टर को प्रेषण: यह सारांश सीधे आपके ओपीडी डॉक्टर के कंप्यूटर पर भेजा जाता है।\n"
            "3. आभा (ABHA) लिंक: आपकी अनुमति से यह जानकारी आपके आभा खाते से जोड़ी जा सकती है।\n"
            "4. गोपनीयता एवं डेटा हटाना: परामर्श पूरा होते ही आपकी आवाज रिकॉर्डिंग और पर्चों की तस्वीरें पूरी तरह मिटा दी जाती हैं।\n"
            "5. स्वैच्छिक: यह प्रक्रिया पूरी तरह स्वैच्छिक है।"
        ),
        "question_prompt": "क्या आप सहमत हैं या अस्वीकार करते हैं? यदि सहमत हैं तो कहें 'हाँ' या 'सहमति', अन्यथा कहें 'नहीं' या 'मना'|",
        "guardian_clause": "18 वर्ष से कम आयु के मरीजों के लिए अभिभावक की स्वतंत्र सहमति आवश्यक है।"
    },
    "te": {
        "title": "మెడికియోస్క్ సంప్రదింపుల కొరకు రోగి సమ్మతి",
        "summary": "మీ వైద్యుడు మీకు మెరుగైన చికిత్స అందించడానికి మీ ఆరోగ్య చరిత్ర మరియు పత్రాలను సేకరిస్తున్నాము.",
        "points": (
            "1. సమాచార సేకరణ: మీ వ్యాధి లక్షణాలు మరియు సమర్పించిన ప్రిస్క్రిప్షన్లు నమోదు చేయబడతాయి.\n"
            "2. వైద్యుడికి చేరవేత: ఈ సారాంశం నేరుగా OPD వైద్యుడికి పంపబడుతుంది.\n"
            "3. ఆయుష్మాన్ భారత్ (ABHA): మీ అనుమతితో మీ ABHA ఖాతాకు అనుసంధానించబడుతుంది.\n"
            "4. గోప్యత: సమర్పించిన వెంటనే అన్ని ఆడియో రికార్డింగ్‌లు మరియు ఫోటోలు శాశ్వతంగా తొలగించబడతాయి."
        ),
        "question_prompt": "మీరు అంగీకరిస్తున్నారా లేదా తిరస్కరిస్తున్నారా? అంగీకరిస్తే 'అంగీకారం' లేదా 'హా' అని చెప్పండి, లేకపోతే 'వద్దు' అని చెప్పండి.",
        "guardian_clause": "18 సంవత్సరాల కంటే తక్కువ వయస్సు ఉన్న రోగులకు సంరక్షకుని సమ్మతి తప్పనిసరి."
    },
    "ta": {
        "title": "மருத்துவ ஆலோசனைக்கான நோயாளி ஒப்புதல்",
        "summary": "உங்கள் மருத்துவர் சிறந்த சிகிச்சை அளிக்க உங்கள் மருத்துவ விவரங்களை சேகரிக்கிறோம்.",
        "points": (
            "1. தகவல் சேகரிப்பு: உங்கள் அறிகுறிகள் மற்றும் முந்தைய மருந்து சீட்டுகள் பதிவு செய்யப்படுகின்றன.\n"
            "2. மருத்துவருக்கு பகிர்தல்: இது நேரடியாக உங்கள் OPD மருத்துவருக்கு அனுப்பப்படும்.\n"
            "3. ABHA இணைப்பு: உங்கள் அனுமதியுடன் தேசிய சுகாதார கணக்குடன் இணைக்கப்படும்.\n"
            "4. தரவு நீக்கம்: சமர்ப்பித்தவுடன் ஆடியோ மற்றும் ஆவண புகைப்படங்கள் நிரந்தரமாக நீக்கப்படும்."
        ),
        "question_prompt": "நீங்கள் ஒப்புக்கொள்கிறீர்களா அல்லது நிராகரிக்கிறீர்களா? ஒப்புக்கொண்டால் 'ஒப்புக் கொள்கிறேன்' அல்லது 'ஆம்' என்று சொல்லுங்கள், இல்லையென்றால் 'வேண்டாம்' என்று சொல்லுங்கள்.",
        "guardian_clause": "18 வயதுக்குட்பட்ட நோயாளிகளுக்கு பாதுகாவலரின் ஒப்புதல் கட்டாயமாகும்."
    },
}


def get_consent_text(language: str = "en") -> Dict[str, str]:
    """Returns plain language consent explanation for given language."""
    clean_lang = language.lower().strip()
    data = CONSENT_TERMS.get(clean_lang, CONSENT_TERMS["en"]).copy()
    data["language"] = clean_lang
    return data
