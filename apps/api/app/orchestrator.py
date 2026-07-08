from uuid import uuid4

from app.models.assessment import AssessmentRequest, AssessmentResponse, DecisionSummary


def start_assessment(payload: AssessmentRequest) -> AssessmentResponse:
    """Create a placeholder assessment until the real agent workflow is wired in."""
    confidence = 4.5 if payload.context else 4.0

    return AssessmentResponse(
        assessment_id=str(uuid4()),
        status="queued",
        decision_summary=DecisionSummary(
            commercial_opportunity="Medium",
            confidence_score=confidence,
            key_risks_count=3,
            comparable_deals_found=0,
            recommended_next_step="Gather more data",
        ),
    )
