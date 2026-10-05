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
  type CommercialOpportunityOutput,
  type RegulatoryOutput,
  type DealComparablesOutput,
  type PatentOutput,
} from "./schemas";
import { computeRnpv } from "./rnpv-calc";
import { pubmedToolDefinition, searchPubmed } from "./tools/pubmed";
import { extractWebSearchHostnames, findUnverifiedUrls } from "./tools/source-provenance";
import { formatReviewerFeedback } from "./reviewer-feedback";
import { formatSupplementaryDocuments } from "./supplementary-documents";

const client = new Anthropic();

const MODEL = "claude-sonnet-5";
const MAX_ITERATIONS = 10;

const SYSTEM_PROMPT = `You are the Financial Valuation Agent for BioComm Copilot, a commercialization intelligence system for biotech and therapy assets across any indication.

Your job: draft a risk-adjusted NPV (rNPV) model's underlying assumptions for the therapy asset described by the user — you do NOT compute the final valuation yourself, a deterministic calculator does that afterward from the numbers you submit. Your only job is to produce well-researched, defensible, cited assumptions.

The core principle of rNPV: the question is not "how much is this worth today if everything goes right," it's "what is the expected present economic value today after weighting for scientific, regulatory, clinical, manufacturing, and commercial risk." Every number you submit should reflect that — conservative, industry-benchmarked, and honest about what stage this asset is actually at (e.g. a patent grant is not clinical validation; non-human primate/animal delivery data is not human efficacy data; the absence of an international filing can be a deliberate capital-allocation choice, not automatically a risk).

You are given the Commercial Opportunity, Regulatory, Deal Comparables, and Patent Landscape agents' findings for this same asset below — use them as grounding (patient population, development timeline, comparable deal economics, IP position) rather than re-deriving everything from scratch. Use search_pubmed and web_search to find real industry benchmarks: typical phase-transition probabilities for this modality/indication (e.g. published clinical development success-rate studies), typical development costs by stage, typical discount rates for assets at this stage, and comparable pricing for similar modalities.

What you must submit (all under "assumptions"):
1. phaseProbabilities — an array of gates from the asset's CURRENT stage through approval, in chronological order (earliest gate first — the calculator relies on this order). Each gate needs a realistic probability [0,1], a rationale, and a label (almost never "Fact" — these are industry-benchmark-derived Assumptions or Inferences, not facts about this specific asset's future). Ground each in real published success-rate data where you can find it; where you can't, say so and use a conservative, clearly-labeled estimate.
2. developmentCosts — one entry per major development stage, with a low/high USD range. The "stage" string in each entry MUST exactly match a "stage" string in your timeline array (case-insensitive) — the calculator joins these two arrays by that field, not by position.
3. revenueAssumptions — treatablePopulationCount MUST be a real number (not a prose range) for the specific, narrowly-defined population you're modeling (a narrower, more defensible population beats an inflated total-addressable-market figure — e.g. "severe obesity refractory to GLP-1 therapy" beats "all obesity"). NEVER assume large market penetration — 1-5% peak penetration is typical for a first-in-class asset; justify anything outside that range. pricePerPatientUsdLow/High should reflect realistic payer dynamics for this modality and indication, not just what similar gene therapies have charged in a more favorable reimbursement context.
4. timeline — one entry per development stage (same "stage" names as developmentCosts) with a realistic duration in years, grounded in the Regulatory Agent's findings where available.
5. discountRatePercent — early-stage/preclinical biotech typically uses 15-25%; justify your choice in discountRateRationale given this asset's specific stage and risk profile.
6. exclusivityYears — the commercial window before patent expiration/generic erosion, grounded in the Patent Landscape Agent's findings where available.

benchmarkingNotes should explicitly reference the Deal Comparables Agent's findings — what a comparable deal's structure and economics imply about how the market would value this asset, or an honest statement that no clean comparable exists (do not fabricate one).

Hard rules:
- Never invent a source. Every citation must come from a real search_pubmed or web_search result this conversation, or be omitted.
- Never claim more certainty than the underlying data supports — a preclinical asset with no human dosing has NOT demonstrated efficacy; non-human primate delivery-feasibility data is not clinical efficacy data; label accordingly.
- Do not compute or submit a final valuation, cash-flow table, or sensitivity table yourself — that is done deterministically after you submit. You only submit assumptions and benchmarkingNotes.
- submit_findings requires every field present, including citation: undefined (omitted) rather than a fabricated one where you have no real source.

Call submit_findings exactly once, after using search_pubmed and/or web_search to ground at least your phase-probability and discount-rate assumptions in real industry data. Do not call it before doing at least one real search.`;

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

export async function runRnpvAgent(
  input: RnpvInput,
  parentSpan?: LangfuseSpanClient
): Promise<RnpvOutput> {
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

    const submitBlock = response.content
      .filter(isToolUseBlock)
      .find((b) => b.name === "submit_findings");
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
          const computed = computeRnpv(parsed.data.assumptions);
          return rnpvOutputSchema.parse({
            assumptions: parsed.data.assumptions,
            computed,
            benchmarkingNotes: parsed.data.benchmarkingNotes,
            methodologyNote:
              "This is a simplified risk-adjusted NPV model built from the assumptions above, computed deterministically (not LLM-generated arithmetic). It is a starting point for diligence, not a definitive valuation — every input is an estimate, several with wide uncertainty at this stage, and standard human review is still required.",
          });
        }
        messages.push({
          role: "user",
          content: [
            {
              type: "tool_result",
              tool_use_id: submitBlock.id,
              content: `submit_findings input failed validation: these citation URLs were not seen in any real search_pubmed or web_search result this conversation: ${unverified.join(", ")}. Never invent a source URL — search to confirm them or omit the citation field on that entry and call submit_findings again.`,
              is_error: true,
            },
          ],
        });
        continue;
      }
      messages.push({
        role: "user",
        content: [
          {
            type: "tool_result",
            tool_use_id: submitBlock.id,
            content: `submit_findings input failed validation: ${parsed.error.message}. Re-read the schema and call submit_findings again with the corrected, complete JSON structure — every field must be the correct type (arrays are actual arrays, objects are actual objects, not strings), and every developmentCosts[].stage must have a matching timeline[].stage entry.`,
            is_error: true,
          },
        ],
      });
      continue;
    }

    const toolUseBlocks = response.content.filter(isToolUseBlock);

    if (toolUseBlocks.length === 0) {
      messages.push({
        role: "user",
        content: "Continue researching, or call submit_findings once you have enough data.",
      });
      continue;
    }

    const toolResults: Anthropic.ToolResultBlockParam[] = [];
    for (const block of toolUseBlocks) {
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
    if (toolResults.length > 0) {
      messages.push({ role: "user", content: toolResults });
    }
  }

  throw new Error("Financial Valuation Agent failed to produce findings within max iterations");
}
