"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { runOrchestrator } from "@/lib/agents/orchestrator";
import {
  persistClinicalResearchOutput,
  persistCompetitiveIntelligenceOutput,
} from "@/lib/agents/persist";

export type RunAssessmentState = {
  error?: string;
  traceUrl?: string;
};

// Triggered from the memo page — runs the Orchestrator (Clinical Research +
// Competitive Intelligence so far; more research agents join this dispatch
// as they're built) and persists whatever completed. Synchronous/blocking
// for now (no progress indicator yet — that's Story 2, P1, deferred) so
// this is slow (~60-120s) but proves the real path: form -> agents ->
// Postgres -> UI.
export async function runAssessment(
  memoRunId: string,
  _prevState: RunAssessmentState,
  _formData: FormData
): Promise<RunAssessmentState> {
  const memoRun = await db.memoRun.findUnique({ where: { id: memoRunId } });
  if (!memoRun) {
    return { error: "Run not found." };
  }

  const manifest = await runOrchestrator({
    target: memoRun.target,
    modality: memoRun.modality,
    stage: memoRun.stage,
    indication: memoRun.indication,
    context: memoRun.context ?? undefined,
  });

  if (manifest.researchOutputs.clinical) {
    await persistClinicalResearchOutput(memoRunId, manifest.researchOutputs.clinical);
  }
  if (manifest.researchOutputs.competitive) {
    await persistCompetitiveIntelligenceOutput(memoRunId, manifest.researchOutputs.competitive);
  }

  // Partial results are still useful (AGENT_PLAN.md §3: surface a partial
  // memo, never hard-fail the whole run) — only error out if every agent
  // that ran actually failed to produce anything.
  const anyAgentSucceeded =
    manifest.agentStatuses.clinical === "complete" ||
    manifest.agentStatuses.competitive === "complete";

  if (!anyAgentSucceeded) {
    const failures = [
      `Clinical Research: ${manifest.agentStatuses.clinical} (${manifest.agentNotes.clinical ?? "no detail"})`,
      `Competitive Intelligence: ${manifest.agentStatuses.competitive} (${manifest.agentNotes.competitive ?? "no detail"})`,
    ].join("; ");
    return { error: failures, traceUrl: manifest.traceUrl };
  }

  revalidatePath(`/memo/${memoRunId}`);
  // router.refresh() from the client alone was confirmed NOT to pick up
  // fresh data in dev (Postgres had the rows both times; the page just
  // never re-rendered) — redirect to the same path forces an actual
  // navigation, which reliably fetches the fresh RSC payload. Same pattern
  // createMemoRun already uses successfully.
  redirect(`/memo/${memoRunId}`);
}
