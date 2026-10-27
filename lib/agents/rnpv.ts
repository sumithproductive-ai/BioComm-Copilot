// Financial Valuation (rNPV) Agent — 9th agent. Runs after the 6 concurrent
// research agents settle (orchestrator.ts) since it grounds its assumptions
// in what Commercial Opportunity, Regulatory, Deal Comparables, and Patents
// already found (patient population, development timeline, comparable deal
// terms, IP position) rather than re-deriving them from scratch.
//
// The LLM only drafts and cites `assumptions` (phase probabilities, costs,
// pricing, timeline, discount rate) plus a qualitative `benchmarkingNotes`
// — the actual cash-flow table, terminal value, and sensitivity scenarios
// are computed afterward by rnpv-calc.ts's deterministic math, not asked of
// the model. See schemas.ts's comment on rnpvOutputSchema for why.

import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import type { LangfuseSpanClient } from "langfuse";
import {
  rnpvSubmissionSchema,
  rnpvOutputSchema,
  type RnpvOutput,
  type FinancialAssumptionsOverride,
  type CommercialOpportunityOutput,
  type RegulatoryOutput,
  type DealComparablesOutput,
  type PatentOutput,
} from "./schemas";
import { computeRnpv, applyFinancialAssumptionsOverride } from "./rnpv-calc";
import { pubmedToolDefinition, searchPubmed } from "./tools/pubmed";
import { extractWebSearchHostnames, findUnverifiedUrls } from "./tools/source-provenance";
import { formatReviewerFeedback } from "./reviewer-feedback";
import { formatSupplementaryDocuments } from "./supplementary-documents";
import { isMockAgentsEnabled } from "./mock-mode";
import type { FinancialAssumptions } from "./schemas";

const client = new Anthropic();

const MODEL = "claude-sonnet-5";
const MAX_ITERATIONS = 10;

// Canonical valuation methodology — distilled from BioComm Copilot's own
// founding specification for how rNPV should be done (not generic literature
// the agent finds on its own). Section 1 is the general framework (applies
// to any asset). Section 2 is a worked, company-commissioned precedent for
// metabolic-disease/obesity gene therapy specifically — two prior rNPV
// analyses of this exact asset class at two different stages (preclinical:
// $60-70M; post-Phase-1-safety: $150-240M), included because they
// deliberately depart from section 1's generic ranges in ways that are
// better-reasoned for this asset class, not because they're wrong to
// deviate. Confirmed live (2026-10) that without any of this, the agent's
// web-sourced probabilities, pricing, and discount rate drifted well
// outside what either section calls for (a 2.15% cumulative POS against a
// ~5% precedent; an 18-22% discount rate stacked on top of an
// already-low POS, double-counting risk the precedent explicitly warns
// against) — flagged by Critic as suspect without knowing why.
const VALUATION_METHODOLOGY = `CANONICAL VALUATION METHODOLOGY (ground every assumption in this, not just whatever general industry literature search_pubmed/web_search happens to surface):

=== 1. GENERAL FRAMEWORK (any asset) ===

PHASE SUCCESS PROBABILITIES — start from these baseline ranges, then explicitly reason about modifiers before picking a number:
- Preclinical -> IND/Phase 1: 60-70%
- Phase 1 -> Phase 2: 50-70%
- Phase 2 -> Phase 3: 25-40%
- Phase 3 -> Approval: 50-70%
- Overall Preclinical -> Approval (cumulative product of all gates): typically 5-15%, though a genuinely high-risk combination (novel mechanism + a historically difficult indication) can reasonably land a bit below that, down to ~4-5% — see the worked precedent in section 2. If your own cumulative product falls well outside even that wider band, that's a signal to revisit your stage-by-stage numbers, not a reason to assume this asset is simply unusual.
Negative modifiers that typically push toward the LOW end of each range: long-term safety/integration-site concerns, manufacturing (CMC) complexity, a genuinely novel mechanism with no approved precedent, uncertain regulatory classification, a historically high-attrition indication. Positive modifiers that can justify the HIGH end: a non-viral/lower-immunogenicity delivery approach, a strong, well-published mechanistic rationale, real large-animal (not just rodent) data, and a large, clearly documented unmet need. Name which modifiers actually apply to THIS asset in your rationale for each gate.

REVENUE ASSUMPTIONS:
- Population: define the narrowest defensible treatable population, not a total-addressable-market figure (e.g. "severe obesity refractory to GLP-1 therapy" beats "all obesity"). A population in the tens of millions is rarely defensible as a "treatable" figure for a first-in-class, non-oral/non-chronic-dosing asset — that's a total-addressable-market number wearing a treatable-population label.
- Peak penetration: 1-5% is typical for a first-in-class asset; justify anything outside that range explicitly.
- Sanity-check the ARITHMETIC PRODUCT, not just each input in isolation: treatablePopulationCount x peak penetration = implied peak patients treated per year. A broad population (tens of millions) times an individually-"typical" 1-5% penetration still produces an unrealistic absolute patient count and peak revenue — two individually-plausible-looking numbers can multiply into an implausible one. See section 2 for a worked peak-patients figure to sanity-check against for this indication class.
- Pricing: gene therapies broadly range $150K-$3M per patient, but that ceiling assumes favorable rare-disease-style reimbursement. For a chronic, high-prevalence, payer-sensitive indication (metabolic disease, obesity, cardiometabolic, and similar), a more realistic range is $25K-$100K per patient — see section 2 for a more specific worked figure.

TIMELINE — typical stage durations: IND-enabling 1-2 years, Phase 1 ~1 year, Phase 2 ~2 years, Phase 3 ~3-4 years, FDA review ~1 year, commercial ramp 3-5 years (total preclinical-to-peak-revenue is typically 8-12 years). Gene therapy manufacturing/CMC readiness can lengthen this further.

DEVELOPMENT COSTS — typical cumulative ranges: Preclinical/IND-enabling $5-20M, Phase 1 $10-30M, Phase 2 $30-80M, Phase 3 $100-300M+. CMC/manufacturing scale-up is often the single largest gene-therapy-specific cost driver.

DISCOUNT RATE — use 10% as the base case for a risk-adjusted biopharma asset (median rate in large-biopharma rNPV surveys for R&D project valuation). This is deliberately lower than a plain-NPV "high discount rate for early biotech" instinct (12-25% is common advice for unadjusted NPV) — in an rNPV model, technical/failure risk is ALREADY fully captured by the phase-probability chain above, so inflating the discount rate on top of that double-counts risk and silently crushes the valuation. Only move above 10-12% for a reason distinct from clinical/technical risk — e.g. a specific company-level capital-structure or financing-risk factor — and say so explicitly in discountRateRationale. Do not cite "gene therapy is risky" alone as justification for a high rate; that risk belongs in the probabilities, not here.

TERMINAL VALUE / EXCLUSIVITY — base this on patent exclusivity and expected post-exclusivity erosion (roughly 8-12 years of significant post-launch sales is a typical range). Do NOT fold in platform-level value (the idea that the underlying delivery platform or pipeline-expansion potential is worth more than this one asset/indication) — that's a separate question a human reader evaluates on top of this single-asset number.

=== 2. INTERNAL METHODOLOGY PRECEDENT: metabolic-disease / obesity gene therapy ===
BioComm Copilot's own internal valuation methodology includes two prior rNPV analyses of a real asset in this exact class (UTMD-delivered, non-viral, multi-gene thermogenic/metabolic mechanism) at two different stages, maintained as calibration reference — not an external published study, deal, or search result. Use these as a calibration anchor whenever the current asset's modality or indication overlaps (gene/cell therapy for obesity, metabolic disease, or a similar energy-expenditure/adiposity mechanism) — not as a lookup table to copy verbatim, but as evidence that these specific numbers are independently defensible for this risk class. IMPORTANT — how to cite this in your output: this is internal methodology, not a search_pubmed/web_search result, so NEVER attach a citation field to an assumption grounded in it, and phrase the rationale as "consistent with BioComm Copilot's internal valuation methodology for this asset class" rather than naming it like an external study (e.g. do not call it a "worked precedent study" or imply it was found via search) — a downstream reviewer should read it as documented internal practice, not as an unverified external claim.

At PRECLINICAL stage (no human dosing yet): Preclinical->IND 50%, Phase1->Phase2 60%, Phase2->Phase3 30%, Phase3->Approval 60%, Approval->Launch 85% (cumulative ~4-5%). Discount rate 10%. Peak annual sales $1.5-2.0B; ~50,000 patients/year treated at peak. Work this backward when setting your own population/penetration: pick treatablePopulationCount and peakPenetrationRateHigh so their PRODUCT lands near 50,000, not just so each number individually "looks typical" — e.g. a population of ~1-1.5 million (a tightly-defined subgroup such as severe-obesity-refractory-to-or-intolerant-of-GLP-1 therapy, not all GLP-1-inadequate-responders broadly) at ~3-4% peak penetration gets you there; a population above ~2 million at "typical" 1-5% penetration will overshoot this precedent even though neither number looks wrong in isolation. Price ~$30-40K/patient. Dev costs: Preclinical ~$5M, Phase1 ~$5-10M, Phase2 ~$20-30M, Phase3 ~$200-250M. Resulting rNPV: ~$60-70M.

At POST-PHASE-1-SAFETY stage (Phase 1 initiated/complete, no efficacy data yet): Phase1->Phase2 60%, Phase2->Phase3 35%, Phase3->Filing 60%, Filing->Approval 85% (cumulative ~10-11% from this point). Discount rate still 10% (unchanged from the preclinical analysis — de-risking shows up in the probabilities and reduced remaining years, not in a lower rate). Peak annual sales $1.8-3.0B. Dev costs remaining: Phase1 ~$5-10M, Phase2 ~$25-40M, Phase3 ~$200-300M, regulatory/commercial prep ~$30-50M. Resulting rNPV: ~$150-240M.

Real comparable deals worth searching for directly (do not assert these without verifying via web_search — search for them by name): Novo Nordisk's 2025 licensing of Lexicon's LX9851 (preclinical small-molecule obesity asset, ~$75M upfront/near-term payments), Pfizer's 2019 option/equity deal with Vivet Therapeutics (preclinical non-viral gene therapy for a metabolic liver disease, ~$51M upfront, ~$686M total potential), Eli Lilly's 2024 deal with Haya Therapeutics (preclinical lncRNA obesity platform, up to $1B in milestones), AbbVie's 2023 deal with Gubra (Phase 1 amylin analog for obesity, $350M upfront), and Novo Nordisk's 2023 acquisition of Inversago Pharma (CB1 program, up to $1.075B). These establish that preclinical-to-Phase-1 metabolic-disease assets typically see $25-100M upfronts with $500M-1B+ total deal value when milestones are included — useful for benchmarkingNotes even when no exact-mechanism match exists.

BEFORE YOU SUBMIT, check your own draft against these common failure modes: unrealistic peak penetration, understated manufacturing/CMC costs, ignored payer/reimbursement resistance, an implied probability of success that reads as near-certain, a discount rate that double-counts risk already captured by your phase probabilities, and gene-therapy-typical pricing applied to a payer-sensitive chronic indication without justification. A credible rNPV uses conservative, defensible, individually-justified assumptions and shows its work — it is not an optimistic story dressed up in a spreadsheet.`;

const SYSTEM_PROMPT = `You are the Financial Valuation Agent for BioComm Copilot, a commercialization intelligence system for biotech and therapy assets across any indication.

Your job: draft a risk-adjusted NPV (rNPV) model's underlying assumptions for the therapy asset described by the user — you do NOT compute the final valuation yourself, a deterministic calculator does that afterward from the numbers you submit. Your only job is to produce well-researched, defensible, cited assumptions.

The core principle of rNPV: the question is not "how much is this worth today if everything goes right," it's "what is the expected present economic value today after weighting for scientific, regulatory, clinical, manufacturing, and commercial risk." Every number you submit should reflect that — conservative, industry-benchmarked, and honest about what stage this asset is actually at (e.g. a patent grant is not clinical validation; non-human primate/animal delivery data is not human efficacy data; the absence of an international filing can be a deliberate capital-allocation choice, not automatically a risk).

${VALUATION_METHODOLOGY}

You are given the Commercial Opportunity, Regulatory, Deal Comparables, and Patent Landscape agents' findings for this same asset below — use them as grounding (patient population, development timeline, comparable deal economics, IP position) rather than re-deriving everything from scratch. Use search_pubmed and web_search to find real, asset-specific or indication-specific data points (published clinical development success-rate studies, comparable pricing, real cost figures) that let you reason within the canonical ranges above — the methodology above is your anchor, real search results are what let you justify where within it (or, with clear justification, outside it) this specific asset belongs.

What you must submit (all under "assumptions"). EVERY entry listed below needs its own "rationale" field — an analyst reviewing this memo must be able to see WHY each number was chosen without re-deriving it themselves. Never leave rationale as a placeholder or restate the number itself; name the actual reasoning (which modifiers apply, which benchmark/precedent you're anchoring to, why this asset departs from or matches it):
1. phaseProbabilities — an array of gates from the asset's CURRENT stage through approval, in chronological order (earliest gate first — the calculator relies on this order). Each gate needs a realistic probability [0,1], a rationale naming which modifiers from the methodology above apply, and a label (almost never "Fact" — these are benchmark-derived Assumptions or Inferences, not facts about this specific asset's future).
2. developmentCosts — one entry per major development stage, with a low/high USD range and a rationale (what's driving the cost at this stage — trial size, CMC complexity, comparable program costs, etc.). The "stage" string in each entry MUST exactly match a "stage" string in your timeline array (case-insensitive) — the calculator joins these two arrays by that field, not by position.
3. revenueAssumptions — treatablePopulationCount MUST be a real number (not a prose range) for the specific, narrowly-defined population you're modeling. pricePerPatientUsdLow/High should reflect realistic payer dynamics for this modality and indication per the methodology above, not just what similar gene therapies have charged in a more favorable reimbursement context. Include ONE rationale covering population sizing, penetration, pricing, and ramp timing together as a connected argument, not four disconnected numbers.
4. timeline — one entry per development stage (same "stage" names as developmentCosts) with a realistic duration in years and a rationale, grounded in the Regulatory Agent's findings where available.
5. discountRatePercent — justify your choice in discountRateRationale given this asset's specific stage and risk profile.
6. exclusivityYears — the commercial window before patent expiration/generic erosion, grounded in the Patent Landscape Agent's findings where available. Justify your choice in exclusivityYearsRationale (patent term, filing date, any extension/exclusivity considerations).

benchmarkingNotes should explicitly reference the Deal Comparables Agent's findings — what a comparable deal's structure and economics imply about how the market would value this asset, or an honest statement that no clean comparable exists (do not fabricate one).

Hard rules:
- Never invent a source. Every citation must come from a real search_pubmed or web_search result this conversation, or be omitted.
- Never claim more certainty than the underlying data supports — a preclinical asset with no human dosing has NOT demonstrated efficacy; non-human primate delivery-feasibility data is not clinical efficacy data; label accordingly.
- Do not compute or submit a final valuation, cash-flow table, or sensitivity table yourself — that is done deterministically after you submit. You only submit assumptions and benchmarkingNotes.
- submit_findings requires every field present, including citation: undefined (omitted) rather than a fabricated one where you have no real source.

Call submit_findings exactly once, after using search_pubmed and/or web_search to ground at least your phase-probability and discount-rate assumptions in real data. Do not call it before doing at least one real search.`;

const submitFindingsTool: Anthropic.Tool = {
  name: "submit_findings",
  description:
    "Submit your final, validated rNPV assumptions and benchmarking notes. Call this only once you have gathered enough real data via search_pubmed and web_search.",
  input_schema: z.toJSONSchema(rnpvSubmissionSchema) as Anthropic.Tool.InputSchema,
};

const webSearchTool: Anthropic.WebSearchTool20260318 = {
  type: "web_search_20260318",
  name: "web_search",
  max_uses: 6,
  allowed_callers: ["direct"],
};

export type RnpvInput = {
  target: string;
  modality: string;
  stage: string;
  indication: string;
  context?: string;
  commercial: CommercialOpportunityOutput | null;
  regulatory: RegulatoryOutput | null;
  dealComparables: DealComparablesOutput | null;
  patents: PatentOutput | null;
  // Deep Research Mode only (orchestrator.ts) — Critic's flags against this
  // agent's prior pass, fed back for a targeted second pass.
  reviewerFeedback?: string[];
  supplementaryDocuments?: string;
  // User-supplied phase-probability/discount-rate/exclusivity-years
  // override (components/agent-progress.tsx's "Known Financial Assumptions"
  // form). Never included in the prompt below — see the comment on
  // financialAssumptionsOverrideSchema for why keeping the agent blind to it
  // matters.
  financialAssumptionsOverride?: FinancialAssumptionsOverride;
};

function isToolUseBlock(block: Anthropic.ContentBlock): block is Anthropic.ToolUseBlock {
  return block.type === "tool_use";
}

function summarizeGroundingContext(input: RnpvInput): string {
  const parts: string[] = [];

  if (input.commercial) {
    parts.push(
      `Commercial Opportunity findings: patient population estimate "${input.commercial.patientPopulationEstimate.value}" (${input.commercial.patientPopulationEstimate.label}); unmet need: ${input.commercial.unmetNeed.summary}; differentiation: ${input.commercial.differentiationPotential.summary}`
    );
  } else {
    parts.push("Commercial Opportunity findings: unavailable (that agent failed or produced no output).");
  }

  if (input.regulatory) {
    parts.push(
      `Regulatory findings: development timeline estimate: ${input.regulatory.developmentTimelineEstimate.summary}; ${input.regulatory.endpointPrecedent.length} endpoint precedent(s) found; ${input.regulatory.priorApprovalsSameMechanism.length} prior approval(s) in the same mechanism class.`
    );
  } else {
    parts.push("Regulatory findings: unavailable (that agent failed or produced no output).");
  }

  if (input.dealComparables) {
    if (input.dealComparables.noCompFound) {
      parts.push(`Deal Comparables findings: no comparable deal found — ${input.dealComparables.noCompExplanation}`);
    } else {
      const deals = input.dealComparables.comparableDeals
        .map((d) => `${d.asset} (${d.company}, ${d.stageAtDeal} ${d.dealType}, ${d.disclosedTerms})`)
        .join("; ");
      parts.push(`Deal Comparables findings: ${deals}`);
    }
  } else {
    parts.push("Deal Comparables findings: unavailable (that agent failed or produced no output).");
  }

  if (input.patents) {
    parts.push(
      `Patent Landscape findings: ${input.patents.patents.length} patent(s) found; ${input.patents.landscapeSummary.summary}`
    );
  } else {
    parts.push("Patent Landscape findings: unavailable (that agent failed or produced no output).");
  }

  return parts.join("\n");
}

// Placeholder assumptions for mock mode — deliberately round, generic
// numbers (never claimed to be researched). Still run through the exact
// same real computeRnpv()/applyFinancialAssumptionsOverride() production
// code below, so this mock path genuinely exercises the calculator and the
// override comparison feature, just without the LLM drafting the inputs.
function mockFinancialAssumptions(): FinancialAssumptions {
  return {
    phaseProbabilities: [
      { fromStage: "Preclinical", toStage: "Phase 1", probability: 0.1, label: "Assumption", rationale: "[MOCK] placeholder." },
      { fromStage: "Phase 1", toStage: "Phase 2", probability: 0.45, label: "Assumption", rationale: "[MOCK] placeholder." },
      { fromStage: "Phase 2", toStage: "Phase 3", probability: 0.2, label: "Assumption", rationale: "[MOCK] placeholder." },
      { fromStage: "Phase 3", toStage: "Approval", probability: 0.35, label: "Assumption", rationale: "[MOCK] placeholder." },
    ],
    developmentCosts: [
      { stage: "Preclinical", lowUsd: 5_000_000, highUsd: 10_000_000, label: "Assumption", rationale: "[MOCK] placeholder." },
      { stage: "Phase 1", lowUsd: 10_000_000, highUsd: 20_000_000, label: "Assumption", rationale: "[MOCK] placeholder." },
      { stage: "Phase 2", lowUsd: 20_000_000, highUsd: 40_000_000, label: "Assumption", rationale: "[MOCK] placeholder." },
      { stage: "Phase 3", lowUsd: 50_000_000, highUsd: 100_000_000, label: "Assumption", rationale: "[MOCK] placeholder." },
    ],
    revenueAssumptions: {
      treatablePopulationCount: 500_000,
      treatablePopulationDescription: "[MOCK] placeholder population",
      treatablePopulationLabel: "Assumption",
      peakPenetrationRateLow: 0.01,
      peakPenetrationRateHigh: 0.03,
      pricePerPatientUsdLow: 50_000,
      pricePerPatientUsdHigh: 100_000,
      yearsToPeakSales: 4,
      rationale: "[MOCK] placeholder.",
      label: "Assumption",
    },
    timeline: [
      { stage: "Preclinical", durationYears: 2, label: "Assumption", rationale: "[MOCK] placeholder." },
      { stage: "Phase 1", durationYears: 1.5, label: "Assumption", rationale: "[MOCK] placeholder." },
      { stage: "Phase 2", durationYears: 2, label: "Assumption", rationale: "[MOCK] placeholder." },
      { stage: "Phase 3", durationYears: 3, label: "Assumption", rationale: "[MOCK] placeholder." },
    ],
    discountRatePercent: 18,
    discountRateRationale: "[MOCK] placeholder discount rate for test mode.",
    exclusivityYears: 10,
    exclusivityYearsRationale: "[MOCK] placeholder.",
  };
}

export async function runRnpvAgent(
  input: RnpvInput,
  parentSpan?: LangfuseSpanClient
): Promise<RnpvOutput> {
  if (isMockAgentsEnabled()) {
    const assumptions = mockFinancialAssumptions();
    const computed = computeRnpv(assumptions, input.stage);
    const providedOverride = input.financialAssumptionsOverride ?? null;
    const providedComputed = providedOverride
      ? computeRnpv(applyFinancialAssumptionsOverride(assumptions, providedOverride), input.stage)
      : null;
    return rnpvOutputSchema.parse({
      assumptions,
      computed,
      benchmarkingNotes: {
        summary: "[MOCK] Test mode — no real research performed (MOCK_AGENTS_FOR_LOCAL_TEST).",
        label: "Unknown",
      },
      methodologyNote:
        "This is a simplified risk-adjusted NPV model built from the assumptions above, computed deterministically (not LLM-generated arithmetic). It is a starting point for diligence, not a definitive valuation — every input is an estimate, several with wide uncertainty at this stage, and standard human review is still required.",
      providedOverride,
      providedComputed,
    });
  }

  const today = new Date().toISOString().slice(0, 10);
  const knownHostnames = new Set<string>();

  const messages: Anthropic.MessageParam[] = [
    {
      role: "user",
      content: [
        {
          type: "text",
          text: `Draft rNPV assumptions for this therapy asset.

Target: ${input.target}
Modality: ${input.modality}
Stage: ${input.stage}
Indication: ${input.indication}
${input.context ? `Additional context: ${input.context}` : ""}

${summarizeGroundingContext(input)}

Today's date is ${today}. Use search_pubmed and web_search to ground your assumptions in real industry data before calling submit_findings.${formatReviewerFeedback(input.reviewerFeedback)}${formatSupplementaryDocuments(input.supplementaryDocuments)}`,
          cache_control: { type: "ephemeral" },
        },
      ],
    },
  ];

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    const isLastChance = i === MAX_ITERATIONS - 1;

    const generation = parentSpan?.generation({
      name: `rnpv-llm-call-${i}`,
      model: MODEL,
      input: messages,
    });

    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 8192,
      system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
      tools: isLastChance ? [submitFindingsTool] : [pubmedToolDefinition, webSearchTool, submitFindingsTool],
      tool_choice: isLastChance ? { type: "tool", name: "submit_findings" } : { type: "auto" },
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
    for (const host of extractWebSearchHostnames(response.content)) knownHostnames.add(host);

    const toolUseBlocks = response.content.filter(isToolUseBlock);
    const submitBlock = toolUseBlocks.find((b) => b.name === "submit_findings");

    // Execute every non-submit_findings tool call in this response up front
    // — needed even when submitBlock is also present and fails validation,
    // since every tool_use block from this assistant turn needs a matching
    // tool_result in the very next message or the next API call is rejected
    // outright. Confirmed live (2026-10): "tool_use ids were found without
    // tool_result blocks immediately after" when the model called
    // submit_findings alongside a search tool in the same turn and
    // submit_findings failed validation — the old code returned/continued
    // right after handling submitBlock, silently dropping the sibling
    // tool_use block's required response.
    const toolResults: Anthropic.ToolResultBlockParam[] = [];
    for (const block of toolUseBlocks) {
      if (block === submitBlock) continue;
      if (block.name === "search_pubmed") {
        const toolSpan = parentSpan?.span({ name: block.name, input: block.input });
        const result = await searchPubmed(block.input as { query: string; maxResults?: number });
        if (result.length > 0) knownHostnames.add("pubmed.ncbi.nlm.nih.gov");
        toolSpan?.end({ output: result });
        toolResults.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: JSON.stringify(result),
        });
      }
      // web_search tool_use blocks are executed server-side by Anthropic —
      // their results are already in this same response, nothing to do here.
    }

    if (submitBlock) {
      const parsed = rnpvSubmissionSchema.safeParse(submitBlock.input);
      if (parsed.success) {
        const citationUrls = [
          ...parsed.data.assumptions.phaseProbabilities.flatMap((p) => (p.citation ? [p.citation.sourceUrl] : [])),
          ...parsed.data.assumptions.developmentCosts.flatMap((c) => (c.citation ? [c.citation.sourceUrl] : [])),
          ...(parsed.data.assumptions.revenueAssumptions.treatablePopulationCitation
            ? [parsed.data.assumptions.revenueAssumptions.treatablePopulationCitation.sourceUrl]
            : []),
          ...(parsed.data.assumptions.revenueAssumptions.citation
            ? [parsed.data.assumptions.revenueAssumptions.citation.sourceUrl]
            : []),
          ...parsed.data.assumptions.timeline.flatMap((t) => (t.citation ? [t.citation.sourceUrl] : [])),
        ];
        const unverified = findUnverifiedUrls(citationUrls, knownHostnames);
        if (unverified.length === 0) {
          const computed = computeRnpv(parsed.data.assumptions, input.stage);
          const providedOverride = input.financialAssumptionsOverride ?? null;
          const providedComputed = providedOverride
            ? computeRnpv(
                applyFinancialAssumptionsOverride(parsed.data.assumptions, providedOverride),
                input.stage
              )
            : null;
          return rnpvOutputSchema.parse({
            assumptions: parsed.data.assumptions,
            computed,
            benchmarkingNotes: parsed.data.benchmarkingNotes,
            methodologyNote:
              "This is a simplified risk-adjusted NPV model built from the assumptions above, computed deterministically (not LLM-generated arithmetic). It is a starting point for diligence, not a definitive valuation — every input is an estimate, several with wide uncertainty at this stage, and standard human review is still required.",
            providedOverride,
            providedComputed,
          });
        }
        toolResults.push({
          type: "tool_result",
          tool_use_id: submitBlock.id,
          content: `submit_findings input failed validation: these citation URLs were not seen in any real search_pubmed or web_search result this conversation: ${unverified.join(", ")}. Never invent a source URL — search to confirm them or omit the citation field on that entry and call submit_findings again.`,
          is_error: true,
        });
        messages.push({ role: "user", content: toolResults });
        continue;
      }
      toolResults.push({
        type: "tool_result",
        tool_use_id: submitBlock.id,
        content: `submit_findings input failed validation: ${parsed.error.message}. Re-read the schema and call submit_findings again with the corrected, complete JSON structure — every field must be the correct type (arrays are actual arrays, objects are actual objects, not strings), and every developmentCosts[].stage must have a matching timeline[].stage entry.`,
        is_error: true,
      });
      messages.push({ role: "user", content: toolResults });
      continue;
    }

    if (toolUseBlocks.length === 0) {
      messages.push({
        role: "user",
        content: "Continue researching, or call submit_findings once you have enough data.",
      });
      continue;
    }

    if (toolResults.length > 0) {
      messages.push({ role: "user", content: toolResults });
    }
  }

  throw new Error("Financial Valuation Agent failed to produce findings within max iterations");
}
