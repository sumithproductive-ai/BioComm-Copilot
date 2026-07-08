from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.models.assessment import AssessmentRequest, AssessmentResponse
from app.orchestrator import start_assessment

app = FastAPI(title="BioComm Copilot API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:3001"],
    allow_origin_regex=r"http://localhost:\d+",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/assessments", response_model=AssessmentResponse)
def create_assessment(payload: AssessmentRequest) -> AssessmentResponse:
    return start_assessment(payload)
