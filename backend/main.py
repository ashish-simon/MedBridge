"""
MediKiosk backend entrypoint.

This file wires together all four modules. Module owners should NOT need to
edit this file — build your logic inside your own module_x/router.py and it
plugs in here automatically. If you think you need to edit main.py, check
with the lead first — that's usually a sign something belongs in your own
module folder instead.

Run locally:
    uvicorn main:app --reload --port 8000

Then visit http://localhost:8000/docs for the auto-generated API explorer —
useful for testing your endpoint without needing the frontend built yet.
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from common.session import start_session
from common.auth import router as auth_router

from module_a.router import router as module_a_router
from module_b.router import router as module_b_router
from module_c.router import router as module_c_router
from module_d.router import router as module_d_router
from v1.router import router as v1_router

app = FastAPI(title="MediBridge API", version="0.1.0")

# Allows the React frontend (running on a different port during development)
# to call this backend. Fine to leave wide open for the hackathon; would be
# restricted to the actual kiosk domain in production.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
def health_check():
    return {"status": "MediBridge backend running"}


@app.post("/api/session/start")
def new_session():
    """
    Step 1 (Identify) calls this to get a patient_id for the session.
    Frontend should call this once, then pass the returned patient_id
    into every subsequent call to Module A/B/C endpoints.
    """
    return start_session()


# Each module's endpoints live under their own prefix, so there's never a
# naming collision between what different people build.
app.include_router(auth_router, prefix="/api/auth", tags=["Auth & User Management"])
app.include_router(v1_router, prefix="/api/v1", tags=["v1 — Integrated Platform Endpoints"])
app.include_router(module_a_router, prefix="/api/module-a", tags=["Module A — Conversation"])
app.include_router(module_b_router, prefix="/api/module-b", tags=["Module B — OCR"])
app.include_router(module_c_router, prefix="/api/module-c", tags=["Module C — Summary"])
app.include_router(module_d_router, prefix="/api/module-d", tags=["Module D — Consent/ABDM"])
