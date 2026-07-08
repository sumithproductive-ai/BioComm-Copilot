from typing import Literal

from pydantic import BaseModel, Field


class AssessmentRequest(BaseModel):
    target: str = Field(..., min_length=2)
    modality: str = Field(..., min_length=2)
    stage: str = Field(..., min_length=2)
    indication: str = Field(..., min_length=2)
    context: str | None = None


class DecisionSummary(BaseModel):
    commercial_opportunity: Literal["High", "Medium", "Low"]
    confidence_score: float = Field(..., ge=0, le=10)
    key_risks_count: int = Field(..., ge=0)
    comparable_deals_found: int = Field(..., ge=0)
    recommended_next_step: Literal[
        "Continue diligence", "Gather more data", "Do not pursue"
    ]


class AssessmentResponse(BaseModel):
    assessment_id: str
    status: Literal["queued", "running", "complete", "failed"]
    decision_summary: DecisionSummary
