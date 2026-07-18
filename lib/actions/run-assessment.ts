"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { runOrchestrator } from "@/lib/agents/orchestrator";
import { persistClinicalResearchOutput } from "@/lib/agents/persist";

export type RunAssessmentState = {
  error?: string;
  traceUrl?: string;
};

// Triggered from the memo page — runs the Orchestrator (currently just
// Clinical Research Agent; more research agents join this dispatch as
// they're built) and persists whatever completed. Synchronous/blocking for
// now (no progress indicator yet — that's Story 2, P1, deferred) so this
// is slow (~60s) but proves the real path: form -> agents -> Postgres -> UI.
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

  if (manifest.agentStatuses.clinical !== "complete") {
    return {
      error: `Clinical Research Agent ${manifest.agentStatuses.clinical}: ${
        manifest.agentNotes.clinical ?? "no further detail"
      }`,
      traceUrl: manifest.traceUrl,
    };
  }

  revalidatePath(`/memo/${memoRunId}`);
  // router.refresh() from the client alone was confirmed NOT to pick up
  // fresh data in dev (Postgres had the rows both times; the page just
  // never re-rendered) — redirect to the same path forces an actual
  // navigation, which reliably fetches the fresh RSC payload. Same pattern
  // createMemoRun already uses successfully.
  redirect(`/memo/${memoRunId}`);
}
