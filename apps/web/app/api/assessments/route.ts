import { NextResponse } from "next/server";

type TherapyProfile = {
  target?: string;
  modality?: string;
  stage?: string;
  indication?: string;
  context?: string;
};

export async function POST(request: Request) {
  const payload = (await request.json()) as TherapyProfile;

  if (
    !payload.target?.trim() ||
    !payload.modality?.trim() ||
    !payload.stage?.trim() ||
    !payload.indication?.trim()
  ) {
    return NextResponse.json(
      { message: "Target, modality, stage, and indication are required." },
      { status: 400 },
    );
  }

  return NextResponse.json({
    assessment_id: crypto.randomUUID(),
    status: "queued",
    decision_summary: {
      commercial_opportunity: "Medium",
      confidence_score: payload.context?.trim() ? 4.5 : 4.0,
      key_risks_count: 3,
      comparable_deals_found: 0,
      recommended_next_step: "Gather more data",
    },
  });
}
