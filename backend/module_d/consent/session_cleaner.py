"""
Real Filesystem Session Cleaner.

Deletes raw temporary files (audio buffers, uploaded document photos, OCR intermediate files)
from local storage on submission.
Confirms deletion happened (checks file no longer exists) before returning success.
"""

import os
import shutil
from pathlib import Path
from typing import Dict, Any, List, Set

# Temporary directory where kiosk stores session audio and scanned document images
_TEMP_SESSION_ROOT = Path(__file__).resolve().parents[1] / "temp_session_storage"
_TEMP_SESSION_ROOT.mkdir(parents=True, exist_ok=True)

# In-memory registry of files tracked per patient_id
_SESSION_FILES: Dict[str, Set[str]] = {}


class SessionStorageManager:
    """Manages creation and verifiable deletion of kiosk session temporary files."""

    @classmethod
    def get_patient_storage_dir(cls, patient_id: str) -> Path:
        pdir = _TEMP_SESSION_ROOT / patient_id
        pdir.mkdir(parents=True, exist_ok=True)
        return pdir

    @classmethod
    def register_temp_file(cls, patient_id: str, file_path: str) -> None:
        """Registers a temporary file (e.g. audio buffer or uploaded document photo)."""
        if patient_id not in _SESSION_FILES:
            _SESSION_FILES[patient_id] = set()
        _SESSION_FILES[patient_id].add(str(Path(file_path).resolve()))

    @classmethod
    def create_sample_session_files(cls, patient_id: str) -> List[str]:
        """Creates sample raw audio and document image files for testing session clearing."""
        pdir = cls.get_patient_storage_dir(patient_id)
        audio_file = pdir / "patient_voice_turn1.wav"
        doc_file = pdir / "prescription_scan_01.jpg"

        with open(audio_file, "wb") as f:
            f.write(b"RIFF_SAMPLE_AUDIO_BUFFER_FOR_DEMO_0123456789")
        with open(doc_file, "wb") as f:
            f.write(b"JPEG_RAW_IMAGE_PRESCRIPTION_DATA_0123456789")

        cls.register_temp_file(patient_id, str(audio_file))
        cls.register_temp_file(patient_id, str(doc_file))
        return [str(audio_file), str(doc_file)]

    @classmethod
    def clear_session_data(cls, patient_id: str) -> Dict[str, Any]:
        """
        Actually deletes all raw temporary files associated with the session.
        Verifies that each file is deleted and no longer exists on disk!
        """
        deleted_files: List[str] = []
        failed_deletions: List[str] = []

        files_to_delete = list(_SESSION_FILES.get(patient_id, set()))

        # Also check patient's directory in _TEMP_SESSION_ROOT
        pdir = _TEMP_SESSION_ROOT / patient_id
        if pdir.exists() and pdir.is_dir():
            for child in pdir.glob("*"):
                if str(child.resolve()) not in files_to_delete:
                    files_to_delete.append(str(child.resolve()))

        for fpath_str in files_to_delete:
            p = Path(fpath_str)
            if p.exists():
                try:
                    p.unlink()
                    # Actively verify deletion
                    if not p.exists():
                        deleted_files.append(str(p))
                    else:
                        failed_deletions.append(str(p))
                except Exception:
                    failed_deletions.append(str(p))
            else:
                deleted_files.append(str(p) + " (already removed)")

        # Remove patient directory if empty
        if pdir.exists():
            try:
                shutil.rmtree(pdir, ignore_errors=True)
            except Exception:
                pass

        _SESSION_FILES.pop(patient_id, None)

        session_cleared_success = len(failed_deletions) == 0
        return {
            "session_cleared": session_cleared_success,
            "deleted_files": deleted_files,
            "failed_deletions": failed_deletions,
            "verification_check": "Confirmed 0 raw files remain on disk" if session_cleared_success else "Warning: Some files could not be deleted",
        }
