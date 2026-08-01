"use server";

import { after } from "next/server";
import { db } from "@/lib/db";
import { runOrchestrator } from "@/lib/agents/orchestrator";
import { AGENT_ROSTER } from "@/lib/agents/roster";
import {
  initializeAgentProgress,
  upsertAgentRunStatus,
  getAgentProgress,
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
  formData: FormData
): Promise<RunAssessmentState> {
  const memoRun = await db.memoRun.findUnique({ where: { id: memoRunId } });
  if (!memoRun) {
    return { error: "Run not found." };
  }

  const deepResearch = formData.get("deepResearch") === "on";

  await initializeAgentProgress(
    memoRunId,
    AGENT_ROSTER.map((agent) => agent.key),
    deepResearch
  );

  after(async () => {
    try {
      const manifest = await runOrchestrator(
        {
          target: memoRun.target,
          modality: memoRun.modality,
          stage: memoRun.stage,
          indication: memoRun.indication,
          context: memoRun.context ?? undefined,
          deepResearch,
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
        // Diagnostic for an unresolved, intermittent anomaly (comprehensive
        // review, 2026-07-25): one real run showed agent_progress status
        // "Complete" for this agent with zero rows across all 3 of its
        // tables (approved_competitor, late_stage_pipeline_asset,
        // positioning_gap) — meaning either the agent itself returned
        // empty arrays despite validating successfully, or persistence
        // silently no-op'd. This log line settles which the next time it
        // recurs: if the counts logged here are already 0, it's an agent
        // issue; if they're non-zero and the DB still ends up empty
        // afterward, it's a persistence issue.
        const { approvedCompetitors, lateStagePipeline, positioningGaps } =
          manifest.researchOutputs.competitive;
        console.log(
          `[runAssessment] run ${memoRunId} persisting competitive intelligence: approvedCompetitors=${approvedCompetitors.length} lateStagePipeline=${lateStagePipeline.length} positioningGaps=${positioningGaps.length}`
        );
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
    } catch (err) {
      // Confirmed live (comprehensive review, 2026-07-25): a rejected
      // indication makes runOrchestrator throw synchronously before any
      // agent's onAgentStatusChange ever fires — with no catch here, that
      // exception was swallowed by after() (logged server-side only) and
      // every AgentProgress row stayed "Queued" forever, since nothing ever
      // wrote a terminal status. Same applies to a throw mid-run (e.g. a
      // persistence call failing after some agents already succeeded).
      // Mark whatever hasn't already reached a terminal status as Failed so
      // the client's polling loop can detect and surface it instead of
      // polling indefinitely.
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[runAssessment] run ${memoRunId} failed:`, err);
      const progress = await getAgentProgress(memoRunId);
      const nonTerminalAgents = (progress?.agentProgress ?? []).filter(
        (row) => row.status === "Queued" || row.status === "Running"
      );
      const agentsToMark =
        nonTerminalAgents.length > 0
          ? nonTerminalAgents.map((row) => row.agentName)
          : AGENT_ROSTER.map((agent) => agent.key);
      await Promise.all(
        agentsToMark.map((agentName) =>
          upsertAgentRunStatus(memoRunId, agentName, "Failed", 0, `Run failed: ${message}`)
        )
      );
    }
  });

  return {};
}
