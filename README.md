# MediKiosk — Project Skeleton

This is the shared starting point for all four module teams. Read this
before you start prompting Antigravity (or any AI tool) for your module.

## What's already built for you

- `backend/main.py` — the FastAPI app that wires all four modules together.
  You should not need to edit this file.
- `backend/common/session.py` — generates a stand-in `patient_id` for every
  kiosk session. This is what Module A/B/C use to tag their data until
  Module D builds the real ABHA-verified ID.
- `backend/module_a/router.py`, `module_b/router.py`, `module_c/router.py`,
  `module_d/router.py` — one stub file per module, already wired into the
  app under `/api/module-a/...`, `/api/module-b/...`, etc. Each stub
  contains comments pointing to the exact PRD section to read and the
  schema your output must match. **Replace the stub logic inside your own
  file — don't touch anyone else's.**
- `shared-schemas/` — the exact JSON shape each module must produce. Locked
  after Day 1. If you think you need to change one, tell the whole team
  first — a silent change here breaks everyone downstream of you.
- `sample-data/` — realistic filled examples of Module A and B's output.
  **Module C's team: build and test against these files today.** You do
  not need to wait for Module A or B to be finished.

## How to run it

```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

Then open `http://localhost:8000/docs` — this gives you a clickable page
to test any endpoint (yours or anyone else's) without needing the frontend
built yet.

## What to give Antigravity (or your AI tool of choice)

Don't paste the whole PRD. Paste only:
1. Your module's section from the PRD (5.A, 5.B, 5.C, or 5.D)
2. PRD Section 7 (the locked tech stack)
3. Your schema file(s) from `shared-schemas/`
4. This README section for your module (below)

### Module A (Ashish + 1)
Work inside `backend/module_a/`. Read the docstring at the top of
`module_a/router.py` first — it lists the exact steps. Your output must
match `shared-schemas/module-a-output.json`. As soon as you have real
output working, update `sample-data/module-a-output-sample.json` with a
real example so Module C can start testing against your actual data
instead of the placeholder.

### Module B (2 people)
Work inside `backend/module_b/`. Fully independent — no dependency on any
other module. Output must match `shared-schemas/module-b-output.json`.

### Module C (2 people)
Work inside `backend/module_c/`. **Start today** — point your code at
`sample-data/module-a-output-sample.json` and
`sample-data/module-b-output-sample.json` (or call
`/api/module-a/sample-output` and `/api/module-b/sample-output` once the
backend is running) instead of waiting for the real modules. Output must
match `shared-schemas/module-c-output.json`.

### Module D (build later)
Work inside `backend/module_d/` once Module A/B/C are stable. Doesn't
block or get blocked by anything else — see the docstring in
`module_d/router.py`.

## Git workflow

- One shared repo, this exact folder structure.
- Each person/pair works on their own branch: `module-a`, `module-b`,
  `module-c`, `module-d`.
- Only work inside your own `module_x/` folder — this is what keeps merge
  conflicts near zero, since nobody's editing the same files.
- Lead merges each branch into `main` at regular checkpoints, testing that
  `uvicorn main:app --reload` still runs cleanly after each merge.
