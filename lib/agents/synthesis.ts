// Synthesis Agent — AGENT_PLAN.md §4.8. Seventh and last agent in the build
// order (needs Critic — now true). "Pure compilation": it never researches
// anything new. The Decision Summary is computed entirely in code from the
// other agents' already-validated outputs (AGENT_PLAN.md §5.1: "deliberately
// boring and explainable... a black-box LLM-generated confidence number
// undermines" the trust the product sells) — the LLM is only used for Key
// Risks and Route Recommendations, and even there it's constrained to
// summarizing/compiling claims that already exist elsewhere in the run,
// never introducing new research.

import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import type { LangfuseSpanClient } from "langfuse";
import {
  keyRiskSchema,
  routeRecommendationSchema,
  synthesisOutputSchema,
  type SynthesisOutput,
  type ResearchOutputs,
  type CriticOutput,
  type DecisionSummary,
} from "./schemas";
import {
  UC_COMPETITOR_REFERENCE_LIST,
  findMissingReferenceCompetitors,
} from "@/lib/config/uc-competitors";

const client = new Anthropic();

const MODEL = "claude-sonnet-5";
const MAX_ATTEMPTS = 3;

// ---------------------------------------------------------------------------
// Decision Summary — every sub-score is a simple, documented rule computed
// from data already on hand. AGENT_PLAN.md §5.1's exact weighted formula:
// confidence = clinical*0.25 + competitive*0.20 + commercial*0.20 +
//              regulatory*0.20 + inverseCriticSeverity*0.15
// This is the methodology footnote text — keep it in sync with the memo UI.
// ---------------------------------------------------------------------------

// clinical_data_completeness = fraction of trials with confirmed current
// (non-stale) status (AGENT_PLAN.md §5.1's own example formula). No trials
// at all is the explicit "insufficient data" case (§5.2.3) — scores 0, not
// a division-by-zero fallback.
function clinicalDataCompleteness(clinical: ResearchOutputs["clinical"]): number {
  if (!clinical || clinical.trials.length === 0) return 0;
  return clinical.trials.filter((t) => !t.isStale).length / clinical.trials.length;
}

// competitive_coverage_completeness = fraction of the hardcoded major-UC-
// competitor reference list actually present in approvedCompetitors — the
// same diff Critic's MissingCompetitor check runs, expressed as a score.
//
// Uses the shared, substring-based findMissingReferenceCompetitors (not an
// exact-match Set lookup) — confirmed live (comprehensive review,
// 2026-07-25) that agents inconsistently report "Vedolizumab" vs.
// "Vedolizumab (Entyvio)", and exact matching silently scored a
// fully-complete 12/11 competitor list as 0.000, corrupting the displayed
// Confidence Score by ~2 points on a real run. Do not reintroduce a local
// exact-match copy of this check here.
function competitiveCoverageCompleteness(competitive: ResearchOutputs["competitive"]): number {
  if (!competitive) return 0;
  const reportedNames = competitive.approvedCompetitors.map((c) => c.drug);
  const missing = findMissingReferenceCompetitors(reportedNames);
  const matchedCount = UC_COMPETITOR_REFERENCE_LIST.length - missing.length;
  return matchedCount / UC_COMPETITOR_REFERENCE_LIST.length;
}

// commercial_source_quality = fraction of the three sourced/labeled
// components (patient population citation, unmet-need citations, a
// differentiation label beyond "Unknown") actually backed by something.
function commercialSourceQuality(commercial: ResearchOutputs["commercial"]): number {
  if (!commercial) return 0;
  const checks = [
    !!commercial.patientPopulationEstimate.citation,
    commercial.unmetNeed.citations.length > 0,
    commercial.differentiationPotential.label !== "Unknown",
  ];
  return checks.filter(Boolean).length / checks.length;
}

// regulatory_precedent_strength = how much real precedent backs this
// asset's regulatory path — endpoint precedent and prior same-mechanism
// approvals, each capped at 3 (a 4th data point adds confidence but not
// proportionally more), averaged.
function regulatoryPrecedentStrength(regulatory: ResearchOutputs["regulatory"]): number {
  if (!regulatory) return 0;
  const endpointScore = Math.min(1, regulatory.endpointPrecedent.length / 3);
  const approvalScore = Math.min(1, regulatory.priorApprovalsSameMechanism.length / 3);
  return (endpointScore + approvalScore) / 2;
}

// inverse_critic_flag_severity "drops sharply if has_critical_flags is
// true" (AGENT_PLAN.md §5.1). No Critic run at all is treated the same as
// maximum severity — the confidence score shouldn't look artificially
// strong just because the review pass never happened.
function inverseCriticFlagSeverity(critic: CriticOutput | null): number {
  if (!critic) return 0;
  if (!critic.hasCriticalFlags) return 1;
  return Math.max(0.1, 1 - critic.flags.length * 0.05);
}

// AGENT_PLAN.md §5.2 point 3, verbatim: "Recommended Next Step defaults
// toward 'Gather more data' when core sections are empty" — the explicit
// example given is a target with zero published trials. That rule
// overrides the confidence-score threshold below, so a data-gap run never
// gets misread as a negative-signal "Do not pursue".
function recommendedNextStep(
  clinical: ResearchOutputs["clinical"],
  confidenceScore: number
): DecisionSummary["recommendedNextStep"] {
  const coreSectionsEmpty = !clinical || clinical.trials.length === 0;
  if (coreSectionsEmpty) return "GatherMoreData";
  if (confidenceScore >= 7) return "ContinueDiligence";
  if (confidenceScore >= 4) return "GatherMoreData";
  return "DoNotPursue";
}

// Not specified anywhere in AGENT_PLAN.md — a judgment call, same as the
// Orchestrator's looksUcRelated heuristic. Reflects commercial promise
// specifically (differentiation + a sourced patient population + no
// unresolved crowding contradiction), not overall data quality — those are
// deliberately different axes from confidenceScore.
function commercialOpportunityRating(
  commercial: ResearchOutputs["commercial"]
): DecisionSummary["commercialOpportunity"] {
  if (!commercial || !commercial.patientPopulationEstimate.citation) return "Low";
  const differentiated = commercial.differentiationPotential.label !== "Unknown";
  const notContradicted = commercial.marketCrowdingAssessment.consistentWithCompetitiveLandscape !== false;
  if (differentiated && notContradicted) return "High";
  return "Medium";
}

function computeDecisionSummary(
  researchOutputs: ResearchOutputs,
  critic: CriticOutput | null,
  keyRisksCount: number
): DecisionSummary {
  const clinicalScore = clinicalDataCompleteness(researchOutputs.clinical);
  const competitiveScore = competitiveCoverageCompleteness(researchOutputs.competitive);
  const commercialScore = commercialSourceQuality(researchOutputs.commercial);
  const regulatoryScore = regulatoryPrecedentStrength(researchOutputs.regulatory);
  const criticScore = inverseCriticFlagSeverity(critic);

  const weightedConfidence =
    clinicalScore * 0.25 +
    competitiveScore * 0.2 +
    commercialScore * 0.2 +
    regulatoryScore * 0.2 +
    criticScore * 0.15;
  const confidenceScore = Math.round(weightedConfidence * 10 * 10) / 10;

  return {
    commercialOpportunity: commercialOpportunityRating(researchOutputs.commercial),
    clinicalDataCompleteness: clinicalScore,
    competitiveCoverageCompleteness: competitiveScore,
    commercialSourceQuality: commercialScore,
    regulatoryPrecedentStrength: regulatoryScore,
    inverseCriticFlagSeverity: criticScore,
    confidenceScore,
    keyRisksCount,
    comparableDealsFoundCount: researchOutputs.dealComparables?.comparableDeals.length ?? 0,
    recommendedNextStep: recommendedNextStep(researchOutputs.clinical, confidenceScore),
  };
}

// ---------------------------------------------------------------------------
// LLM part — Key Risks + Route Recommendations only. No tools: same as
// Critic, this agent reasons over structured JSON it's given, nothing else.
// ---------------------------------------------------------------------------

const synthesisSubmissionSchema = z.object({
  keyRisks: z.array(keyRiskSchema),
  routeRecommendations: z.array(routeRecommendationSchema),
});

const SYSTEM_PROMPT = `You are the Synthesis Agent for BioComm Copilot, a commercialization intelligence system for ulcerative colitis (UC) therapy assets. You compile — you do not research. Every other agent has already run; you are given their complete outputs plus the Critic Agent's review flags.

Your only two jobs:

1. Key Risks — pull together the most material risks a BD analyst evaluating this asset needs to know, drawn ONLY from what's already in the data you were given: clinical safety signals, similar drug failures, market crowding issues, regulatory uncertainty, undisclosed deal terms, and Critic flags. Do not invent a risk that isn't traceable to something already present. For each risk:
   - "label" should match the confidence of the underlying finding it's drawn from (carry over its label if it has one; use "Inference" if you're synthesizing across multiple findings; use "Unknown" only if the risk itself is uncertain, not the underlying data).
   - "citation" should be copied from the source finding's citation if it has one — never fabricate a new citation. Omit citation if the underlying finding didn't have one (e.g. a risk drawn from a Critic flag, which has no citation of its own).
   - Prioritize risks a human reviewer would actually want flagged before making a diligence decision — 3 to 8 risks is typical; do not pad the list with restatements of the same risk.

2. Route Recommendations — concrete next steps for a BD analyst's diligence process, grounded in gaps this run actually surfaced (e.g. "commission an independent literature review of comparative safety data across the IL-23p19 class" if that gap was flagged; "confirm FDA guidance applicability via a pre-IND meeting" if regulatory precedent was thin). Every recommendation is labeled "Assumption" by definition (the schema enforces this) — these are suggested actions, not settled facts. 2 to 6 recommendations is typical.

Hard rules:
- Never introduce a clinical, competitive, commercial, regulatory, or deal fact that isn't already present in the JSON you were given. You compile; you do not research.
- If Critic flagged something, treat that as strong signal for a Key Risk — Critic flags exist specifically so they surface here, not just in Reviewer Notes.
- Call submit_findings exactly once.`;

const submitFindingsTool: Anthropic.Tool = {
  name: "submit_findings",
  description: "Submit the compiled Key Risks and Route Recommendations for this memo. Call this exactly once.",
  input_schema: z.toJSONSchema(synthesisSubmissionSchema) as Anthropic.Tool.InputSchema,
};

export type SynthesisInput = {
  target: string;
  modality: string;
  indication: string;
  researchOutputs: ResearchOutputs;
  criticOutput: CriticOutput | null;
};

function isToolUseBlock(block: Anthropic.ContentBlock): block is Anthropic.ToolUseBlock {
  return block.type === "tool_use";
}

export async function runSynthesisAgent(
  input: SynthesisInput,
  parentSpan?: LangfuseSpanClient
): Promise<SynthesisOutput> {
  const today = new Date().toISOString().slice(0, 10);

  const messages: Anthropic.MessageParam[] = [
    {
      role: "user",
      content: `Compile the Key Risks and Route Recommendations for this memo.

Target: ${input.target}
Modality: ${input.modality}
Indication: ${input.indication}
Today's date: ${today}

Research outputs (any section may be null if that agent failed to produce output):
${JSON.stringify(input.researchOutputs, null, 2)}

Critic Agent review (null if Critic didn't run):
${JSON.stringify(input.criticOutput, null, 2)}

Call submit_findings with your compiled Key Risks and Route Recommendations.`,
    },
  ];

  let submission: z.infer<typeof synthesisSubmissionSchema> | null = null;

  for (let attempt = 0; attempt < MAX_ATTEMPTS && !submission; attempt++) {
    const generation = parentSpan?.generation({
      name: `synthesis-llm-call-${attempt}`,
      model: MODEL,
      input: messages,
    });

    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 8192,
      system: SYSTEM_PROMPT,
      tools: [submitFindingsTool],
      tool_choice: { type: "tool", name: "submit_findings" },
      messages,
    });

    generation?.end({
      output: response.content,
      usage: {
        input: response.usage.input_tokens,
        output: response.usage.output_tokens,
        unit: "TOKENS",
      },
    });

    messages.push({ role: "assistant", content: response.content });

    const submitBlock = response.content
      .filter(isToolUseBlock)
      .find((b) => b.name === "submit_findings");
    if (submitBlock) {
      const parsed = synthesisSubmissionSchema.safeParse(submitBlock.input);
      if (parsed.success) {
        submission = parsed.data;
        break;
      }
      messages.push({
        role: "user",
        content: [
          {
            type: "tool_result",
            tool_use_id: submitBlock.id,
            content: `submit_findings input failed validation: ${parsed.error.message}. Re-read the schema and call submit_findings again with the corrected, complete JSON structure.`,
            is_error: true,
          },
        ],
      });
      continue;
    }

    messages.push({
      role: "user",
      content: "Call submit_findings now with your compiled Key Risks and Route Recommendations.",
    });
  }

  if (!submission) {
    throw new Error("Synthesis Agent failed to produce findings within max attempts");
  }

  const decisionSummary = computeDecisionSummary(
    input.researchOutputs,
    input.criticOutput,
    submission.keyRisks.length
  );

  return synthesisOutputSchema.parse({
    decisionSummary,
    keyRisks: submission.keyRisks,
    routeRecommendations: submission.routeRecommendations,
    asOfDate: today,
  });
}
