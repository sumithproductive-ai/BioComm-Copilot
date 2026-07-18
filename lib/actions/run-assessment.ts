"use server";

import { after } from "next/server";
import { db } from "@/lib/db";
import { runOrchestrator } from "@/lib/agents/orchestrator";
import { AGENT_ROSTER } from "@/lib/agents/roster";
import {
  initializeAgentProgress,
  upsertAgentRunStatus,
  persistClinicalResearchOutput,
  persistCompetitiveIntelligenceOutput,
  persistCommercialOpportunityOutput,
  persistRegulatoryOutput,
  persistDealComparablesOutput,
  persistCriticOutput,
  persistSynthesisOutput,
} from "@/lib/agents/persist";

export type RunAssessmentState = {
  error?: string;
};

// Triggered from the memo page. Fast path only: validates and marks all 7
// agents Queued, then schedules the actual ~2-4min Orchestrator run via
// Next.js's after() so this returns almost immediately instead of blocking
// the whole request — Story 2's live progress screen
// (components/agent-progress.tsx) polls AgentProgress rows for the rest and
// refreshes the page once every agent reaches a terminal state. This
// replaced a single blocking action that awaited the whole run and
// redirected on completion.
export async function runAssessment(
  memoRunId: string,
  _prevState: RunAssessmentState,
  _formData: FormData
): Promise<RunAssessmentState> {
  const memoRun = await db.memoRun.findUnique({ where: { id: memoRunId } });
  if (!memoRun) {
    return { error: "Run not found." };
  }

  await initializeAgentProgress(
    memoRunId,
    AGENT_ROSTER.map((agent) => agent.key)
  );

  after(async () => {
    const manifest = await runOrchestrator(
      {
        target: memoRun.target,
        modality: memoRun.modality,
        stage: memoRun.stage,
        indication: memoRun.indication,
        context: memoRun.context ?? undefined,
      },
      {
        onAgentStatusChange: (agentName, status, info) =>
          upsertAgentRunStatus(memoRunId, agentName, status, info.attempt, info.note),
      }
    );

    if (manifest.researchOutputs.clinical) {
      await persistClinicalResearchOutput(memoRunId, manifest.researchOutputs.clinical);
    }
    if (manifest.researchOutputs.competitive) {
      await persistCompetitiveIntelligenceOutput(memoRunId, manifest.researchOutputs.competitive);
    }
    if (manifest.researchOutputs.commercial) {
      await persistCommercialOpportunityOutput(memoRunId, manifest.researchOutputs.commercial);
    }
    if (manifest.researchOutputs.regulatory) {
      await persistRegulatoryOutput(memoRunId, manifest.researchOutputs.regulatory);
    }
    if (manifest.researchOutputs.dealComparables) {
      await persistDealComparablesOutput(memoRunId, manifest.researchOutputs.dealComparables);
    }
    if (manifest.criticOutput) {
      await persistCriticOutput(memoRunId, manifest.criticOutput);
    }
    if (manifest.synthesisOutput) {
      await persistSynthesisOutput(memoRunId, manifest.synthesisOutput, manifest.elapsedMs);
    }
  });

  return {};
}
