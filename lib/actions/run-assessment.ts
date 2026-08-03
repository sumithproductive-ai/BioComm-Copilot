"use server";

import { after } from "next/server";
import { db } from "@/lib/db";
import { executeAssessmentRun } from "@/lib/agents/run-executor";
import { assessmentRunQueue } from "@/lib/agents/run-queue";
import { checkRateLimit, getClientKey, RateLimitError } from "@/lib/rate-limit";
import { requireSession, UnauthorizedError } from "@/lib/require-session";

export type RunAssessmentState = {
  error?: string;
};

// Each run costs real Anthropic API spend across up to 8 agents — bounds
// how many full pipelines one client can kick off in a burst. Still IP-keyed
// even now that Google OAuth exists (lib/rate-limit.ts) — a compromised or
// careless allowlisted account is still worth bounding, not just anonymous
// traffic.
const RUN_ASSESSMENT_LIMIT = { maxRequests: 5, windowMs: 10 * 60 * 1000 };

// Triggered from the memo page. Fast path only: returns almost immediately
// and schedules the actual ~2-4min (or longer, in Deep Research Mode) run
// through assessmentRunQueue inside Next.js's after() — Story 2's live
// progress screen (components/agent-progress.tsx) polls AgentProgress rows
// for the rest and refreshes the page once every agent reaches a terminal
// state. Routing through the same queue batch submissions use
// (lib/actions/create-batch.ts) means a manual run and a batch fairly share
// the same system-wide concurrency cap instead of each assuming unlimited
// capacity.
export async function runAssessment(
  memoRunId: string,
  _prevState: RunAssessmentState,
  formData: FormData
): Promise<RunAssessmentState> {
  try {
    await requireSession();
    checkRateLimit(await getClientKey(), RUN_ASSESSMENT_LIMIT);
  } catch (err) {
    if (err instanceof UnauthorizedError) return { error: err.message };
    if (err instanceof RateLimitError) return { error: err.message };
    throw err;
  }

  const memoRun = await db.memoRun.findUnique({ where: { id: memoRunId } });
  if (!memoRun) {
    return { error: "Run not found." };
  }

  const deepResearch = formData.get("deepResearch") === "on";

  after(() => assessmentRunQueue(() => executeAssessmentRun(memoRun, deepResearch)));

  return {};
}
