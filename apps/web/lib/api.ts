export type TherapyProfile = {
  target: string;
  modality: string;
  stage: string;
  indication: string;
  context?: string;
};

export type AssessmentResponse = {
  assessment_id: string;
  status: "queued" | "running" | "complete" | "failed";
  decision_summary: {
    commercial_opportunity: "High" | "Medium" | "Low";
    confidence_score: number;
    key_risks_count: number;
    comparable_deals_found: number;
    recommended_next_step:
      | "Continue diligence"
      | "Gather more data"
      | "Do not pursue";
  };
};

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "";
const ASSESSMENTS_ENDPOINT = API_BASE_URL
  ? `${API_BASE_URL}/assessments`
  : "/api/assessments";

export async function createAssessment(
  profile: TherapyProfile,
): Promise<AssessmentResponse> {
  const response = await fetch(ASSESSMENTS_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(profile),
  });

  if (!response.ok) {
    throw new Error("The assessment could not be started.");
  }

  return response.json();
}
