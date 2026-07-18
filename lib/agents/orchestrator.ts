// Orchestrator — AGENT_PLAN.md §4.1. Top-level coordinator; never touches
// sources directly. All 5 research agents are now built: Clinical Research,
// Competitive Intelligence, Commercial Opportunity, Regulatory, and Deal
// Comparables. Critic and Synthesis (AGENT_PLAN.md §4.7-4.8) are the two
// remaining agents in the overall build order — this manifest's shape
// already anticipates them but doesn't invoke them yet.

import { randomUUID } from "node:crypto";
import type { LangfuseSpanClient } from "langfuse";
import { runClinicalResearchAgent, type ClinicalResearchInput } from "./clinical-research";
import {
  runCompetitiveIntelligenceAgent,
  type CompetitiveIntelligenceInput,
} from "./competitive-intelligence";
import {
  runCommercialOpportunityAgent,
  type CommercialOpportunityInput,
} from "./commercial-opportunity";
import { runRegulatoryAgent, type RegulatoryInput } from "./regulatory";
import { runDealComparablesAgent, type DealComparablesInput } from "./deal-comparables";
import type { CompetitiveIntelligenceOutput, ResearchOutputs } from "./schemas";
import { langfuse, isLangfuseConfigured } from "./observability";

export type OrchestratorInput = {
  target: string;
  modality: string;
  stage: string;
  indication: string;
  context?: string;
};

export type AgentStatus = "complete" | "incomplete" | "failed";

export type RunManifest = {
  sessionId: string;
  agentStatuses: Record<keyof ResearchOutputs, AgentStatus>;
  agentNotes: Partial<Record<keyof ResearchOutputs, string>>;
  elapsedMs: number;
  researchOutputs: ResearchOutputs;
  traceUrl?: string;
};

const MAX_RETRIES_PER_AGENT = 2;

// Known-simple heuristic, not a real classifier — matches PRD.md non-goal
// #1 ("UC only in v1") well enough to catch an obviously wrong indication
// (e.g. "Crohn's disease") without the cost/latency of an LLM call just for
// this check. False positives are possible (e.g. "collagenous colitis"
// would incorrectly pass) — acceptable for a PoC guardrail, not for a
// production compliance gate.
function looksUcRelated(indication: string): boolean {
  return /colitis/i.test(indication) || /\buc\b/i.test(indication);
}

// Runs one agent with up to maxRetries retries — AGENT_PLAN.md §3's 2-retry
// policy. Each attempt is its own Langfuse span (Story 14 AC: "Orchestrator
// retries are captured as separate spans with retry count noted"), and the
// agent function receives that span to attach its own nested generations
// and tool-call spans to.
async function runWithRetries<T>(
  runTrace: ReturnType<typeof langfuse.trace> | null,
  name: string,
  fn: (span?: LangfuseSpanClient) => Promise<T>,
  maxRetries = MAX_RETRIES_PER_AGENT
): Promise<{ status: AgentStatus; output: T | null; note?: string }> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const span = runTrace?.span({
      name: `${name}-attempt-${attempt}`,
      metadata: { agent: name, attempt, maxRetries },
    });
    try {
      const output = await fn(span);
      span?.end({ output, metadata: { result: "success" } });
      return { status: "complete", output };
    } catch (err) {
      lastError = err;
      const message = err instanceof Error ? err.message : String(err);
      span?.end({ level: "ERROR", statusMessage: message });
      console.error(`[orchestrator] ${name} attempt ${attempt + 1}/${maxRetries + 1} failed:`, err);
    }
  }
  const message = lastError instanceof Error ? lastError.message : String(lastError);
  return { status: "incomplete", output: null, note: `Failed after ${maxRetries + 1} attempts: ${message}` };
}

export async function runOrchestrator(input: OrchestratorInput): Promise<RunManifest> {
  if (!input.target || !input.modality || !input.stage || !input.indication) {
    throw new Error("target, modality, stage, and indication are all required");
  }
  if (!looksUcRelated(input.indication)) {
    throw new Error(
      `Indication "${input.indication}" doesn't look UC-related — this system only supports ulcerative colitis in v1 (PRD.md non-goal #1).`
    );
  }

  const sessionId = randomUUID();
  const start = Date.now();
  const langfuseEnabled = isLangfuseConfigured();

  // The trace's own id doubles as the "session_id" every child span is
  // implicitly grouped under (Story 14: "all traces for a single memo run
  // linked by a shared session ID") — one trace per run, not per agent.
  const runTrace = langfuseEnabled
    ? langfuse.trace({ id: sessionId, name: "memo-run", input })
    : null;

  const clinicalInput: ClinicalResearchInput = {
    target: input.target,
    modality: input.modality,
    stage: input.stage,
    indication: input.indication,
    context: input.context,
  };
  const competitiveInput: CompetitiveIntelligenceInput = {
    target: input.target,
    modality: input.modality,
    indication: input.indication,
  };
  const commercialInput: CommercialOpportunityInput = {
    target: input.target,
    modality: input.modality,
    indication: input.indication,
  };
  const regulatoryInput: RegulatoryInput = {
    target: input.target,
    modality: input.modality,
    stage: input.stage,
    indication: input.indication,
  };
  const dealComparablesInput: DealComparablesInput = {
    target: input.target,
    modality: input.modality,
    stage: input.stage,
    indication: input.indication,
  };

  // Dispatch every research agent concurrently — Promise.allSettled so one
  // slow/failed agent never blocks the others (AGENT_PLAN.md §3's explicit
  // failure mode to guard against). Clinical and Competitive both query
  // ClinicalTrials.gov — this is exactly the concurrent-agent scenario the
  // shared rate limiter (lib/agents/tools/rate-limiter.ts) was built for.
  //
  // Commercial Opportunity has a soft dependency on Competitive
  // Intelligence's output (§3): it still dispatches concurrently, not after
  // Competitive finishes, but its own agent function awaits
  // competitiveOutputOnlyPromise internally for a fast reconciliation step
  // before returning. Deriving that promise via .then() doesn't re-run
  // Competitive — both consumers share the one underlying call.
  const competitivePromise = runWithRetries(runTrace, "competitive", (span) =>
    runCompetitiveIntelligenceAgent(competitiveInput, span)
  );
  const competitiveOutputOnlyPromise: Promise<CompetitiveIntelligenceOutput | null> =
    competitivePromise.then((r) => r.output);

  const [clinicalResult, competitiveResult, commercialResult, regulatoryResult, dealComparablesResult] =
    await Promise.allSettled([
      runWithRetries(runTrace, "clinical", (span) => runClinicalResearchAgent(clinicalInput, span)),
      competitivePromise,
      runWithRetries(runTrace, "commercial", (span) =>
        runCommercialOpportunityAgent(commercialInput, span, competitiveOutputOnlyPromise)
      ),
      runWithRetries(runTrace, "regulatory", (span) => runRegulatoryAgent(regulatoryInput, span)),
      runWithRetries(runTrace, "dealComparables", (span) =>
        runDealComparablesAgent(dealComparablesInput, span)
      ),
    ]);

  const agentStatuses = {
    clinical: "failed",
    competitive: "failed",
    commercial: "failed",
    dealComparables: "failed",
    regulatory: "failed",
  } as Record<keyof ResearchOutputs, AgentStatus>;

  const agentNotes: Partial<Record<keyof ResearchOutputs, string>> = {};

  const researchOutputs: ResearchOutputs = {
    clinical: null,
    competitive: null,
    commercial: null,
    dealComparables: null,
    regulatory: null,
  };

  if (clinicalResult.status === "fulfilled") {
    agentStatuses.clinical = clinicalResult.value.status;
    researchOutputs.clinical = clinicalResult.value.output;
    if (clinicalResult.value.note) agentNotes.clinical = clinicalResult.value.note;
  } else {
    agentNotes.clinical = `Unexpected rejection: ${String(clinicalResult.reason)}`;
  }

  if (competitiveResult.status === "fulfilled") {
    agentStatuses.competitive = competitiveResult.value.status;
    researchOutputs.competitive = competitiveResult.value.output;
    if (competitiveResult.value.note) agentNotes.competitive = competitiveResult.value.note;
  } else {
    agentNotes.competitive = `Unexpected rejection: ${String(competitiveResult.reason)}`;
  }

  if (commercialResult.status === "fulfilled") {
    agentStatuses.commercial = commercialResult.value.status;
    researchOutputs.commercial = commercialResult.value.output;
    if (commercialResult.value.note) agentNotes.commercial = commercialResult.value.note;
  } else {
    agentNotes.commercial = `Unexpected rejection: ${String(commercialResult.reason)}`;
  }

  if (regulatoryResult.status === "fulfilled") {
    agentStatuses.regulatory = regulatoryResult.value.status;
    researchOutputs.regulatory = regulatoryResult.value.output;
    if (regulatoryResult.value.note) agentNotes.regulatory = regulatoryResult.value.note;
  } else {
    agentNotes.regulatory = `Unexpected rejection: ${String(regulatoryResult.reason)}`;
  }

  if (dealComparablesResult.status === "fulfilled") {
    agentStatuses.dealComparables = dealComparablesResult.value.status;
    researchOutputs.dealComparables = dealComparablesResult.value.output;
    if (dealComparablesResult.value.note) agentNotes.dealComparables = dealComparablesResult.value.note;
  } else {
    agentNotes.dealComparables = `Unexpected rejection: ${String(dealComparablesResult.reason)}`;
  }

  const elapsedMs = Date.now() - start;
  runTrace?.update({ output: { agentStatuses, elapsedMs } });

  // Serverless/short-lived processes can exit before Langfuse's internal
  // batch timer fires — flush explicitly so the trace is actually sent.
  if (langfuseEnabled) await langfuse.flushAsync();

  return {
    sessionId,
    agentStatuses,
    agentNotes,
    elapsedMs,
    researchOutputs,
    traceUrl: runTrace?.getTraceUrl(),
  };
}
