"use server";

import { after } from "next/server";
import { db } from "@/lib/db";
import { executeAssessmentRun } from "@/lib/agents/run-executor";
import { assessmentRunQueue } from "@/lib/agents/run-queue";

export type RunAssessmentState = {
  error?: string;
};

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
  const memoRun = await db.memoRun.findUnique({ where: { id: memoRunId } });
  if (!memoRun) {
    return { error: "Run not found." };
  }

  const deepResearch = formData.get("deepResearch") === "on";

  after(() => assessmentRunQueue(() => executeAssessmentRun(memoRun, deepResearch)));

  return {};
}
