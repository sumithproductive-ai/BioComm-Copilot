# BioComm Copilot

BioComm Copilot is a UC-focused commercialization intelligence system for first-pass biotech BD assessments.

This repository now separates planning artifacts from the buildable product code:

| Area | Purpose |
| --- | --- |
| `apps/web` | Next.js frontend for the analyst-facing workflow |
| `apps/api` | FastAPI backend for orchestration, agents, and memo generation |
| `docs/planning` | Index for product strategy, requirements, personas, and build plans |
| `BioComm_Copilot.html` | Original bundled visual prototype |

## Current Build Direction

The real app will follow the architecture described in the product docs:

1. Analyst enters therapy profile.
2. API validates the request.
3. Orchestrator coordinates domain agents.
4. Critic reviews agent outputs for unsupported claims and gaps.
5. Synthesis produces a source-cited memo.
6. Frontend renders progress, decision summary, reviewer notes, and memo sections.

## Local Development

Frontend:

```bash
cd apps/web
npm install
npm run dev
```

The web app includes a local preview API route, so the form works even when the FastAPI service is not running.

Backend:

```bash
cd apps/api
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

Use Python 3.12 or another runtime with compatible FastAPI/Pydantic wheels.

For full-stack mode, run the frontend with `NEXT_PUBLIC_API_BASE_URL=http://localhost:8000`.
