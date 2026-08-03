// Core "run the Orchestrator and persist everything" logic, extracted so
// both the manual "Run Assessment" button (lib/actions/run-assessment.ts)
// and batch submissions (lib/actions/create-batch.ts) share one
// implementation instead of two copies drifting apart. initializeAgentProgress
// is the first thing this does — deliberately not called by the caller ahead
// of time, so AgentProgress rows (and the "Queued" -> "In Progress" status a
// caller like the /assessments list derives from their mere existence) only
// appear once this run has actually been dequeued from assessmentRunQueue
// and is really starting, not the moment it was merely submitted.

import { runOrchestrator } from "./orchestrator";
import { AGENT_ROSTER } from "./roster";
import {
  initializeAgentProgress,
  upsertAgentRunStatus,
  getAgentProgress,
  persistClinicalResearchOutput,
  persistCompetitiveIntelligenceOutput,
  persistCommercialOpportunityOutput,
  persistRegulatoryOutput,
  persistDealComparablesOutput,
  persistPatentOutput,
  persistCriticOutput,
  persistSynthesisOutput,
} from "./persist";

export type ExecutableMemoRun = {
  id: string;
  target: string;
  modality: string;
  stage: string;
  indication: string;
  context: string | null;
};

export async function executeAssessmentRun(
  memoRun: ExecutableMemoRun,
  deepResearch: boolean,
  // Text already extracted from user-uploaded PDFs before this was called
  // (see lib/pdf-extract.ts) — never the files themselves.
  // supplementaryDocumentCount/Note are only for the memo's transparency
  // note (how many documents were used, and what was skipped/truncated and
  // why), not a record of what was uploaded.
  supplementaryDocuments?: string,
  supplementaryDocumentCount = 0,
  supplementaryDocumentNote?: string
): Promise<void> {
  const memoRunId = memoRun.id;

  await initializeAgentProgress(
    memoRunId,
    AGENT_ROSTER.map((agent) => agent.key),
    deepResearch,
    supplementaryDocumentCount,
    supplementaryDocumentNote
  );

  try {
    const manifest = await runOrchestrator(
      {
        target: memoRun.target,
        modality: memoRun.modality,
        stage: memoRun.stage,
        indication: memoRun.indication,
        context: memoRun.context ?? undefined,
        deepResearch,
        supplementaryDocuments,
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
        `[run-executor] run ${memoRunId} persisting competitive intelligence: approvedCompetitors=${approvedCompetitors.length} lateStagePipeline=${lateStagePipeline.length} positioningGaps=${positioningGaps.length}`
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
    if (manifest.researchOutputs.patents) {
      await persistPatentOutput(memoRunId, manifest.researchOutputs.patents);
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
    console.error(`[run-executor] run ${memoRunId} failed:`, err);
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
}
