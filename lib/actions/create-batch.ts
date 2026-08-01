"use server";

import { after } from "next/server";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { batchProfileSchema } from "@/lib/validations/therapy-profile";
import { executeAssessmentRun, type ExecutableMemoRun } from "@/lib/agents/run-executor";
import { assessmentRunQueue } from "@/lib/agents/run-queue";

export type CreateBatchState = {
  error?: string;
};

// Batch queue entry point (roadmap: "scheduling / overnight runs" — the
// batch-queue interpretation of that, confirmed over a delayed-start
// scheduler). Submits N therapy profiles at once; every one becomes a real
// MemoRun immediately (so they show up on /assessments right away as
// "Queued"), but their actual Orchestrator runs are scheduled through the
// same assessmentRunQueue the single "Run Assessment" button uses — so
// submitting 10 profiles before bed doesn't fire 10 full pipelines
// simultaneously, it runs 2 at a time and works through the rest
// automatically. No separate "batch" concept persists anywhere; once
// created, each MemoRun is indistinguishable from one created individually.
export async function createBatchAssessments(
  _prevState: CreateBatchState,
  formData: FormData
): Promise<CreateBatchState> {
  const targets = formData.getAll("target[]").map(String);
  const modalities = formData.getAll("modality[]").map(String);
  const stages = formData.getAll("stage[]").map(String);
  const indications = formData.getAll("indication[]").map(String);
  const contexts = formData.getAll("context[]").map(String);
  const deepResearch = formData.get("deepResearch") === "on";

  const profiles = targets.map((target, i) => ({
    target,
    modality: modalities[i] ?? "",
    stage: stages[i],
    indication: indications[i] ?? "",
    context: contexts[i] || undefined,
  }));

  const parsed = batchProfileSchema.safeParse(profiles);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Fix the highlighted profiles and try again." };
  }

  const memoRuns: ExecutableMemoRun[] = [];
  for (const profile of parsed.data) {
    const memoRun = await db.memoRun.create({ data: profile });
    memoRuns.push(memoRun);
  }

  after(() =>
    Promise.all(
      memoRuns.map((memoRun) => assessmentRunQueue(() => executeAssessmentRun(memoRun, deepResearch)))
    )
  );

  redirect("/assessments");
}
